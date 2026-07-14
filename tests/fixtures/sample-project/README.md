# Tempo

Tempo is a tiny command-line temperature converter used as a known fixture
for evaluating the Smith Agent PoC.

## Usage

```
python -m src.cli 100 --from c --to f
212.00
```

Supported units: `c` (Celsius), `f` (Fahrenheit), `k` (Kelvin).
Values below absolute zero are rejected.
