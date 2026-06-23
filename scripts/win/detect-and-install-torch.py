"""Detect NVIDIA GPU compute capability and install a matching PyTorch CUDA wheel."""
from __future__ import annotations

import subprocess
import sys


def run_pip(args: list[str]) -> int:
    cmd = [sys.executable, "-m", "pip", *args]
    print("[pip]", " ".join(cmd), flush=True)
    return subprocess.call(cmd)


def query_gpu() -> tuple[float, str, str] | None:
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=compute_cap,name,driver_version",
                "--format=csv,noheader",
            ],
            text=True,
            errors="replace",
        ).strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None

    if not out:
        return None

    cap_str, name, driver = [part.strip() for part in out.splitlines()[0].split(",", 2)]
    return float(cap_str), name, driver


def pick_cuda_wheel(compute_cap: float, gpu_name: str) -> tuple[str, str]:
    name_lower = gpu_name.lower()
    if compute_cap >= 12.0 or "50" in name_lower or "blackwell" in name_lower:
        return "cu128", "https://download.pytorch.org/whl/cu128"
    if compute_cap >= 8.9:
        return "cu124", "https://download.pytorch.org/whl/cu124"
    if compute_cap >= 8.0:
        return "cu121", "https://download.pytorch.org/whl/cu121"
    return "cu118", "https://download.pytorch.org/whl/cu118"


def verify_cuda() -> bool:
    try:
        import torch

        ok = bool(torch.cuda.is_available())
        if ok:
            cap = torch.cuda.get_device_capability(0)
            print(
                f"[验证] torch {torch.__version__} | cuda={ok} | "
                f"device={torch.cuda.get_device_name(0)} | capability={cap}",
                flush=True,
            )
        else:
            print(f"[验证] torch {torch.__version__} | cuda=False", flush=True)
        return ok
    except Exception as exc:
        print(f"[验证] PyTorch 检查失败: {exc}", flush=True)
        return False


def install_cpu_torch() -> int:
    print("[提示] 未检测到 NVIDIA GPU，安装 CPU 版 PyTorch ...", flush=True)
    code = run_pip(
        ["install", "torch", "torchaudio", "--index-url", "https://download.pytorch.org/whl/cpu"]
    )
    return 0 if code == 0 else 1


def install_cuda_torch(tag: str, index_url: str) -> int:
    print(f"[提示] 安装 PyTorch {tag} ...", flush=True)
    run_pip(["uninstall", "-y", "torch", "torchaudio", "torchvision"])
    code = run_pip(
        ["install", "torch", "torchaudio", "--index-url", index_url]
    )
    if code == 0 and verify_cuda():
        return 0

    if tag == "cu128":
        print("[警告] 稳定版 cu128 不可用，尝试 nightly cu128 ...", flush=True)
        run_pip(["uninstall", "-y", "torch", "torchaudio", "torchvision"])
        code = run_pip(
            [
                "install",
                "--pre",
                "torch",
                "torchaudio",
                "--index-url",
                "https://download.pytorch.org/whl/nightly/cu128",
                "--no-cache-dir",
            ]
        )
        if code == 0 and verify_cuda():
            return 0

    print("[错误] CUDA 版 PyTorch 安装后仍不可用。", flush=True)
    return 1


def main() -> int:
    force = "--force" in sys.argv[1:]

    gpu = query_gpu()
    if gpu is None:
        try:
            import torch  # noqa: F401
        except ImportError:
            return install_cpu_torch()
        print("[跳过] 无 NVIDIA GPU，保留现有 PyTorch。", flush=True)
        return 0

    compute_cap, gpu_name, driver = gpu
    tag, index_url = pick_cuda_wheel(compute_cap, gpu_name)
    print(
        f"[检测] GPU={gpu_name} | compute={compute_cap} | driver={driver} | 选择 {tag}",
        flush=True,
    )

    if not force and verify_cuda():
        print("[跳过] 当前 .venv 中 CUDA 版 PyTorch 已可用。", flush=True)
        return 0

    return install_cuda_torch(tag, index_url)


if __name__ == "__main__":
    raise SystemExit(main())
