"""Tests for the Tempo conversion helpers."""

import pytest

from src.temperature import convert


def test_celsius_to_fahrenheit():
    assert convert(100.0, "c", "f") == pytest.approx(212.0)


def test_kelvin_round_trip():
    assert convert(convert(20.0, "c", "k"), "k", "c") == pytest.approx(20.0)


def test_below_absolute_zero_rejected():
    with pytest.raises(ValueError):
        convert(-500.0, "c", "f")
