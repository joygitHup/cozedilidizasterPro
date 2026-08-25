"""Find first free TCP port starting from --start (inclusive)."""
import argparse
import socket


def is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('0.0.0.0', port))
            return True
        except OSError:
            return False


def find_free(start: int, attempts: int = 50) -> int:
    for port in range(start, start + attempts):
        if is_free(port):
            return port
    raise SystemExit(f'No free port in [{start}, {start + attempts})')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', type=int, required=True)
    args = parser.parse_args()
    print(find_free(args.start))
