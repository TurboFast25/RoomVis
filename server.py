from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOST = "127.0.0.1"
PORT = 4173
MODEL = os.environ.get("ROOMVIS_GEMINI_MODEL", "gemini-3.1-flash-image-preview")
API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
WEB_ROOT = Path(__file__).resolve().parent


class RoomVisHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def do_POST(self) -> None:
        if self.path != "/api/generate":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            self.respond_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "Set GEMINI_API_KEY before starting server.py."},
            )
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(content_length))
            request_body = build_gemini_request(payload)
            gemini_response = call_gemini_api(request_body, api_key)
            result = extract_generation_result(gemini_response)
        except ValueError as exc:
            self.respond_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            self.respond_json(
                exc.code,
                {"error": f"Gemini API error {exc.code}", "details": body},
            )
            return
        except urllib.error.URLError as exc:
            self.respond_json(
                HTTPStatus.BAD_GATEWAY,
                {"error": "Could not reach Gemini API", "details": str(exc.reason)},
            )
            return

        self.respond_json(HTTPStatus.OK, result)

    def respond_json(self, status: HTTPStatus, body: dict) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def build_gemini_request(payload: dict) -> dict:
    room_image_data_url = payload.get("roomImageDataUrl")
    furniture = payload.get("furniture", [])
    user_prompt = str(payload.get("prompt", "")).strip()

    if not room_image_data_url:
        raise ValueError("roomImageDataUrl is required")

    mime_type, base64_data = parse_data_url(room_image_data_url)
    furniture_lines = [
        f"- {item['name']} at approximately ({round(item['x'])}%, {round(item['y'])}%) "
        f"with scale {item['scale']} and rotation {item['rotation']} degrees"
        for item in furniture
    ]

    prompt_parts = [
        "Use the provided room photo as the base image.",
        "Stage the room photorealistically with the following furniture placements.",
        "\n".join(furniture_lines) if furniture_lines else "- No extra furniture placements were supplied.",
        "Preserve room geometry, perspective, and lighting unless explicitly changed.",
    ]
    if user_prompt:
        prompt_parts.append(f"Additional direction: {user_prompt}")

    return {
        "contents": [
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64_data,
                        }
                    },
                    {"text": "\n".join(prompt_parts)},
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
                "aspectRatio": "16:9",
                "imageSize": "2K",
            },
        },
    }


def parse_data_url(data_url: str) -> tuple[str, str]:
    if not data_url.startswith("data:") or "," not in data_url:
        raise ValueError("roomImageDataUrl must be a valid data URL")

    header, encoded = data_url.split(",", 1)
    if ";base64" not in header:
        raise ValueError("roomImageDataUrl must contain base64 image data")

    mime_type = header[5:].split(";", 1)[0]
    if not mime_type.startswith("image/"):
        raise ValueError("roomImageDataUrl must contain an image")

    return mime_type, encoded


def call_gemini_api(request_body: dict, api_key: str) -> dict:
    url = f"{API_ROOT}/{MODEL}:generateContent"
    request = urllib.request.Request(
        url,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def extract_generation_result(response: dict) -> dict:
    candidates = response.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini response did not include any candidates")

    parts = (candidates[0].get("content") or {}).get("parts") or []
    image_data_url = ""
    text_parts = []

    for part in parts:
        inline_data = part.get("inlineData") or part.get("inline_data")
        if inline_data and inline_data.get("data"):
            mime_type = inline_data.get("mimeType") or inline_data.get("mime_type") or "image/png"
            image_data_url = f"data:{mime_type};base64,{inline_data['data']}"
        elif part.get("text"):
            text_parts.append(part["text"])

    return {
        "imageDataUrl": image_data_url,
        "meta": {
            "model": MODEL,
            "text": "\n".join(text_parts).strip() or "No text response.",
        },
    }


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), RoomVisHandler)
    print(f"Serving RoomVis at http://{HOST}:{PORT}")
    server.serve_forever()
