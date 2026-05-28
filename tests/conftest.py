import sys
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

import pytest


@pytest.fixture
def data_cache():
    return {}


@pytest.fixture
def jsessionid():
    return "FAKE_JSESSIONID"
