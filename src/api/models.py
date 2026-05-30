"""Pydantic request/response models for the TPCU API."""

from typing import Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    uid: str = Field(..., min_length=1)
    pwd: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    token: str


class ChatRequest(BaseModel):
    token: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    mode: Literal['fast', 'normal', 'think'] = 'normal'


class AnswerRequest(BaseModel):
    token: str = Field(..., min_length=1)
    selected: str = Field(..., min_length=1)


class LLMConfigRequest(BaseModel):
    base_url: str = Field(..., min_length=1)
    api_key: str = Field(default="")
    model: str = Field(..., min_length=1)


class LLMConfigResponse(BaseModel):
    has_custom_config: bool
    base_url: str = ""
    model: str = ""
