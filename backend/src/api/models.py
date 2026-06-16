"""Pydantic request/response models for the TPCU API."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    uid: str = Field(..., min_length=1)
    pwd: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    token: str
    name: str = ""             # 學生姓名（解析到才有值）
    semester_value: str = ""   # 當前學年學期，例如 "114,2"


class ChatRequest(BaseModel):
    token: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    file_id: str | None = None


class AnswerRequest(BaseModel):
    token: str = Field(..., min_length=1)
    selected: str = Field(..., min_length=1)


class LLMConfigRequest(BaseModel):
    base_url: str = Field(..., min_length=1)
    api_key: str = Field(default="")
    model: str = Field(..., min_length=1)


class LLMModelsRequest(BaseModel):
    base_url: str = Field(..., min_length=1)
    api_key: str = Field(default="")


class LLMConfigResponse(BaseModel):
    has_custom_config: bool
    base_url: str = ""
    model: str = ""


class LLMBehaviourPatch(BaseModel):
    temperature: float | None = None
    max_tokens: int | None = None
    system_prompt: str | None = None
    context_length: int | None = None


class SettingsPatch(BaseModel):
    llm: LLMBehaviourPatch | None = None


class LLMBehaviourSettings(BaseModel):
    temperature: float = 0.7
    max_tokens: int = 2048
    system_prompt: str = ""
    context_length: int = 20


class UserSettings(BaseModel):
    llm: LLMBehaviourSettings = LLMBehaviourSettings()


class FullSettingsResponse(BaseModel):
    uid: str
    settings: UserSettings
    llm_status: LLMConfigResponse


class UsageDayStat(BaseModel):
    date: str
    prompt: int
    completion: int
    turns: int


class UsageResponse(BaseModel):
    days: list[UsageDayStat]
    total_prompt: int
    total_completion: int
    total_turns: int
