"""Pydantic request/response models for the TPCU API."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    uid: str = Field(..., min_length=1)
    pwd: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    token: str


class ChatRequest(BaseModel):
    token: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)


class AnswerRequest(BaseModel):
    token: str = Field(..., min_length=1)
    selected: str = Field(..., min_length=1)
