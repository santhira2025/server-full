from cryptography.fernet import Fernet
from server.config import settings

class Encryption:
    """
    Simple symmetric encryption utility for sensitive data like PATs.
    Uses Fernet with a key from settings.
    """
    _fernet = None

    @classmethod
    def get_instance(cls) -> Fernet:
        if cls._fernet is None:
            # If no key is set, we use a default (not recommended for production)
            key = settings.ENCRYPTION_KEY or Fernet.generate_key().decode()
            cls._fernet = Fernet(key.encode())
        return cls._fernet

    @classmethod
    def encrypt(cls, data: str) -> str:
        if not data:
            return ""
        return cls.get_instance().encrypt(data.encode()).decode()

    @classmethod
    def decrypt(cls, encrypted_data: str) -> str:
        if not encrypted_data:
            return ""
        return cls.get_instance().decrypt(encrypted_data.encode()).decode()
