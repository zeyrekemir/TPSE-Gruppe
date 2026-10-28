#!/usr/bin/env python3
"""Stand-in for TU-ID during development: a tiny OpenID Connect provider with fixed test users.

Lets the "Sign in with TU-ID" button work end to end on a laptop before the lab has a real client
registration. NEVER expose it on a network: anyone can sign in as anyone.

    python tools/dev_oidc.py            # listens on http://localhost:9000

Backend settings (backend/.env):

    ROBOTS_OIDC_ISSUER=http://localhost:9000
    ROBOTS_OIDC_CLIENT_ID=robot-hub-dev
    ROBOTS_OIDC_CLIENT_SECRET=dev-secret
    ROBOTS_OIDC_ADMIN_GROUP=pearl-admins

Requires PyJWT[crypto] (already in the backend's requirements).
"""

import base64
import hashlib
import html
import json
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlencode, urlparse

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

PORT = 9000
ISSUER = f"http://localhost:{PORT}"
CLIENT_ID = "robot-hub-dev"
CLIENT_SECRET = "dev-secret"

USERS = {
    "ab12cdef": {"name": "Anna Becker", "email": "anna.becker@example.org", "groups": ["pearl-admins"]},
    "xy34ghij": {"name": "Max Müller", "email": "max.mueller@example.org", "groups": []},
}

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
KID = "dev-1"
CODES: dict[str, dict] = {}  # one-time authorization codes


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body, content_type="application/json", headers=None):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == "/.well-known/openid-configuration":
            return self._send(200, json.dumps({
                "issuer": ISSUER,
                "authorization_endpoint": f"{ISSUER}/authorize",
                "token_endpoint": f"{ISSUER}/token",
                "jwks_uri": f"{ISSUER}/jwks",
                "response_types_supported": ["code"],
                "id_token_signing_alg_values_supported": ["RS256"],
                "code_challenge_methods_supported": ["S256"],
            }))
        if url.path == "/jwks":
            jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(KEY.public_key()))
            return self._send(200, json.dumps({"keys": [jwk | {"kid": KID, "use": "sig", "alg": "RS256"}]}))
        if url.path == "/authorize":
            if q.get("client_id") != CLIENT_ID:
                return self._send(400, "unknown client_id", "text/plain")
            buttons = "".join(
                f'<button name="user" value="{u}">{html.escape(i["name"])} <small>({u}'
                f'{", Admin" if "pearl-admins" in i["groups"] else ""})</small></button>'
                for u, i in USERS.items()
            )
            hidden = "".join(f'<input type="hidden" name="{k}" value="{html.escape(v)}">' for k, v in q.items())
            return self._send(200, PAGE.format(buttons=buttons, hidden=hidden), "text/html; charset=utf-8")
        if url.path == "/approve":
            user = q.get("user")
            if user not in USERS:
                return self._send(400, "unknown user", "text/plain")
            code = secrets.token_urlsafe(24)
            CODES[code] = {
                "user": user,
                "nonce": q.get("nonce"),
                "redirect_uri": q["redirect_uri"],
                "challenge": q.get("code_challenge"),
                "expires": time.time() + 60,
            }
            location = q["redirect_uri"] + "?" + urlencode({"code": code, "state": q.get("state", "")})
            return self._send(302, "", "text/plain", {"Location": location})
        return self._send(404, "not found", "text/plain")

    def do_POST(self):
        if urlparse(self.path).path != "/token":
            return self._send(404, "not found", "text/plain")
        length = int(self.headers.get("Content-Length", 0))
        form = {k: v[0] for k, v in parse_qs(self.rfile.read(length).decode()).items()}
        # client_secret_basic (the OIDC default, as TU-ID uses): id and secret in an HTTP Basic header.
        basic = self.headers.get("Authorization", "")
        if basic.startswith("Basic "):
            user, _, secret = base64.b64decode(basic[6:]).decode().partition(":")
            form |= {"client_id": unquote(user), "client_secret": unquote(secret)}
        grant = CODES.pop(form.get("code", ""), None)
        if (
            grant is None
            or grant["expires"] < time.time()
            or form.get("client_id") != CLIENT_ID
            or form.get("client_secret") != CLIENT_SECRET
            or form.get("redirect_uri") != grant["redirect_uri"]
            or b64url(hashlib.sha256(form.get("code_verifier", "").encode()).digest()) != grant["challenge"]
        ):
            return self._send(400, json.dumps({"error": "invalid_grant"}))
        info = USERS[grant["user"]]
        now = int(time.time())
        id_token = jwt.encode(
            {
                "iss": ISSUER, "aud": CLIENT_ID, "sub": f"tuid-{grant['user']}", "iat": now, "exp": now + 300,
                "nonce": grant["nonce"], "preferred_username": grant["user"],
                "name": info["name"], "email": info["email"], "groups": info["groups"],
            },
            KEY, algorithm="RS256", headers={"kid": KID},
        )
        return self._send(200, json.dumps({"id_token": id_token, "token_type": "Bearer", "expires_in": 300}))

    def log_message(self, fmt, *args):
        print("[dev-oidc]", fmt % args)


PAGE = """<!doctype html><meta charset="utf-8"><title>TU-ID (Test)</title>
<style>body{{font:16px system-ui;background:#0b0d17;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0}}
form{{background:#161927;padding:2rem;border-radius:16px;display:grid;gap:.8rem;min-width:320px}}
button{{font:inherit;padding:.8rem 1rem;border-radius:10px;border:1px solid #444;background:#222640;color:#fff;cursor:pointer;text-align:left}}
button:hover{{border-color:#8b8bff}}small{{color:#999}}.warn{{color:#fbbf24;font-size:.85rem}}</style>
<form action="/approve" method="get"><h2 style="margin:0">TU-ID · Testanmeldung</h2>
<p class="warn">Nur für die Entwicklung. Echte TU-ID kommt nach der Registrierung beim HRZ.</p>
{hidden}{buttons}</form>"""


if __name__ == "__main__":
    print(f"Test OpenID provider on {ISSUER} (development only)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
