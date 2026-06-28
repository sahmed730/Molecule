import requests
from jose import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

FIREBASE_PROJECT_ID = 'molecules-8487f'
CERTS_URI = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_cached_certs = {}

def get_firebase_certs():
    global _cached_certs
    if not _cached_certs:
        resp = requests.get(CERTS_URI)
        _cached_certs = resp.json()
    return _cached_certs

class User:
    def __init__(self, uid, email):
        self.id = uid
        self.email = email

def verify_firebase_token(token: str):
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            raise ValueError("No kid found in token")
        
        certs = get_firebase_certs()
        cert_pem = certs.get(kid)
        if not cert_pem:
            # Refresh certs
            global _cached_certs
            _cached_certs = {}
            certs = get_firebase_certs()
            cert_pem = certs.get(kid)
            if not cert_pem:
                raise ValueError("Key ID not found in Firebase certs")

        payload = jwt.decode(
            token,
            cert_pem,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"
        )
        return payload
    except Exception as e:
        raise ValueError(f"Token validation failed: {e}")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        decoded_token = verify_firebase_token(token)
        uid = decoded_token.get("uid")
        email = decoded_token.get("email")
        return User(uid=uid, email=email)
    except Exception as e:
        print(f"Auth error: {e}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_authorized_user(current_user: User = Depends(get_current_user)):
    """Restricts AI generation capabilities to the owner's account."""
    if current_user.email != "ahmedali51367@gmail.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not authorized to use the AI generation features."
        )
    return current_user
