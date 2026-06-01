"""Token cost calculation by model."""

from __future__ import annotations

# (input_per_million_usd, output_per_million_usd)
_PRICE_TABLE: dict[str, tuple[float, float]] = {
    "gemini-2.0-flash":                   (0.075,  0.30),
    "gemini-2.0-flash-lite":              (0.075,  0.30),
    "gemini-2.0-flash-thinking-exp":      (0.075,  0.30),
    "gemini-2.5-flash":                   (0.075,  0.30),
    "gemini-2.5-flash-preview-05-20":     (0.075,  0.30),
    "gemini-1.5-flash":                   (0.075,  0.30),
    "gemini-1.5-flash-8b":                (0.0375, 0.15),
    "gemini-1.5-pro":                     (1.25,   5.00),
}


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
) -> float:
    key = model.split("/")[-1]  # strip provider prefix if any
    prices = _PRICE_TABLE.get(key)
    if prices is None:
        return 0.0  # local/unknown models cost nothing
    input_price, output_price = prices
    # Cached tokens are billed at 25% of the input price
    billable_input = input_tokens - cached_tokens
    return (
        billable_input * input_price / 1_000_000
        + cached_tokens * input_price * 0.25 / 1_000_000
        + output_tokens * output_price / 1_000_000
    )
