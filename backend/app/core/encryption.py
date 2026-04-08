"""AES-256-CBC encryption/decryption utilities for the vault feature."""

import base64
import os

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import SystemSettings

VAULT_KEY_SETTING = "vault_encryption_key"


async def get_vault_key(db: AsyncSession) -> bytes:
    """Get or create the vault encryption key from the database."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == VAULT_KEY_SETTING)
    )
    setting = result.scalar_one_or_none()

    if setting and setting.value:
        return base64.b64decode(setting.value)

    # Generate new 32-byte key
    key = os.urandom(32)
    key_b64 = base64.b64encode(key).decode("utf-8")

    new_setting = SystemSettings(
        key=VAULT_KEY_SETTING,
        value=key_b64,
        description="Vault AES-256 encryption key (auto-generated)",
        is_secret=True,
    )
    db.add(new_setting)
    await db.commit()

    return key


def encrypt_text(plaintext: str, key: bytes) -> str:
    """Encrypt text with AES-256-CBC. Returns Base64-encoded IV+ciphertext."""
    iv = os.urandom(16)
    padder = padding.PKCS7(128).padder()
    padded = padder.update(plaintext.encode("utf-8")) + padder.finalize()

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()

    return base64.b64encode(iv + ciphertext).decode("utf-8")


def decrypt_text(encrypted: str, key: bytes) -> str:
    """Decrypt AES-256-CBC Base64-encoded text."""
    raw = base64.b64decode(encrypted)
    iv = raw[:16]
    ciphertext = raw[16:]

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()

    unpadder = padding.PKCS7(128).unpadder()
    plaintext = unpadder.update(padded) + unpadder.finalize()

    return plaintext.decode("utf-8")


def encrypt_bytes(data: bytes, key: bytes) -> bytes:
    """Encrypt bytes with AES-256-CBC. Returns IV+ciphertext."""
    iv = os.urandom(16)
    padder = padding.PKCS7(128).padder()
    padded = padder.update(data) + padder.finalize()

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()

    return iv + ciphertext


def decrypt_bytes(data: bytes, key: bytes) -> bytes:
    """Decrypt AES-256-CBC bytes (IV+ciphertext)."""
    iv = data[:16]
    ciphertext = data[16:]

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()

    unpadder = padding.PKCS7(128).unpadder()
    return unpadder.update(padded) + unpadder.finalize()
