#!/usr/bin/env python3
"""Verify Tauri updater signatures against the public key the app ships with.

    verify.py <tauri.conf.json> <bundle>...

Each <bundle> is checked against <bundle>.sig with plugins.updater.pubkey from the
config. Exit 1 on the first signature that does not verify. This is the check the
installed app makes before it replaces itself, run here before anything uploads, so
a wrong key in KMS or a stale pubkey in the config fails the release, not the user.

Tauri signs with minisign, prehashed: the Ed25519 message is BLAKE2b-512 of the file.
Python's standard library has the hash and no Ed25519, so the verifier below is the
RFC 8032 section 6 reference.
"""
import base64
import hashlib
import json
import sys

P = 2**255 - 19
Q = 2**252 + 27742317777372353535851937790883648493
D = -121665 * pow(121666, P - 2, P) % P
SQRT_M1 = pow(2, (P - 1) // 4, P)


def recover_x(y, sign):
    if y >= P:
        return None
    x2 = (y * y - 1) * pow(D * y * y + 1, P - 2, P) % P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (P + 3) // 8, P)
    if (x * x - x2) % P:
        x = x * SQRT_M1 % P
    if (x * x - x2) % P:
        return None
    return P - x if (x & 1) != sign else x


def add(a, b):
    A = (a[1] - a[0]) * (b[1] - b[0]) % P
    B = (a[1] + a[0]) * (b[1] + b[0]) % P
    C = 2 * a[3] * b[3] * D % P
    E = 2 * a[2] * b[2] % P
    e, f, g, h = B - A, E - C, E + C, B + A
    return (e * f % P, g * h % P, f * g % P, e * h % P)


def mul(s, point):
    r = (0, 1, 1, 0)
    while s:
        if s & 1:
            r = add(r, point)
        point = add(point, point)
        s >>= 1
    return r


def same(a, b):
    return (a[0] * b[2] - b[0] * a[2]) % P == 0 and (a[1] * b[2] - b[1] * a[2]) % P == 0


def decompress(raw):
    y = int.from_bytes(raw, "little")
    sign, y = y >> 255, y & ((1 << 255) - 1)
    x = recover_x(y, sign)
    return None if x is None else (x, y, 1, x * y % P)


_gy = 4 * pow(5, P - 2, P) % P
_gx = recover_x(_gy, 0)
BASE = (_gx, _gy, 1, _gx * _gy % P)


def ed25519_verify(public, message, signature):
    a, r = decompress(public), decompress(signature[:32])
    s = int.from_bytes(signature[32:], "little")
    if a is None or r is None or s >= Q:
        return False
    h = int.from_bytes(hashlib.sha512(signature[:32] + public + message).digest(), "little") % Q
    return same(mul(s, BASE), add(r, mul(h, a)))


def minisign_lines(blob):
    return base64.b64decode(blob).decode().splitlines()


def check(public_b64, path):
    pub = base64.b64decode(minisign_lines(public_b64)[1])
    if pub[:2] != b"Ed" or len(pub) != 42:
        raise SystemExit("verify: pubkey is not a minisign Ed25519 key")
    with open(path + ".sig") as f:
        sig = base64.b64decode(minisign_lines(f.read().strip())[1])
    if sig[:2] != b"ED" or len(sig) != 74:
        raise SystemExit(f"verify: {path}.sig is not a prehashed minisign signature")
    if sig[2:10] != pub[2:10]:
        raise SystemExit(f"verify: {path} is signed by key {sig[2:10][::-1].hex().upper()}, "
                         f"the app trusts {pub[2:10][::-1].hex().upper()}")
    digest = hashlib.blake2b(digest_size=64)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            digest.update(chunk)
    if not ed25519_verify(pub[10:], digest.digest(), sig[10:]):
        raise SystemExit(f"verify: {path}.sig does not verify")
    print(f"verified {path} (key {pub[2:10][::-1].hex().upper()})")


def main(argv):
    if len(argv) < 3:
        raise SystemExit(__doc__)
    with open(argv[1]) as f:
        pubkey = json.load(f)["plugins"]["updater"]["pubkey"]
    for path in argv[2:]:
        check(pubkey, path)


if __name__ == "__main__":
    main(sys.argv)
