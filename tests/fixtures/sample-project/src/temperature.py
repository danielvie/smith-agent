"""Temperature conversion helpers for Tempo."""

ABSOLUTE_ZERO_C = -273.15


def to_celsius(value: float, unit: str) -> float:
    """Convert a value in the given unit to Celsius."""
    if unit == "c":
        return value
    if unit == "f":
        return (value - 32.0) * 5.0 / 9.0
    if unit == "k":
        return value + ABSOLUTE_ZERO_C
    raise ValueError(f"unknown unit: {unit}")


def from_celsius(value: float, unit: str) -> float:
    """Convert a Celsius value to the given unit."""
    if unit == "c":
        return value
    if unit == "f":
        return value * 9.0 / 5.0 + 32.0
    if unit == "k":
        return value - ABSOLUTE_ZERO_C
    raise ValueError(f"unknown unit: {unit}")


def convert(value: float, src: str, dst: str) -> float:
    """Convert between units, rejecting temperatures below absolute zero."""
    celsius = to_celsius(value, src)
    if celsius < ABSOLUTE_ZERO_C:
        raise ValueError("temperature is below absolute zero")
    return from_celsius(celsius, dst)
