"""Command-line entry point for Tempo."""

import argparse

from .temperature import convert


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tempo", description="Convert temperatures.")
    parser.add_argument("value", type=float, help="temperature value to convert")
    parser.add_argument("--from", dest="src", choices=["c", "f", "k"], required=True)
    parser.add_argument("--to", dest="dst", choices=["c", "f", "k"], required=True)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    result = convert(args.value, args.src, args.dst)
    print(f"{result:.2f}")


if __name__ == "__main__":
    main()
