from pathlib import Path

from simcore import Event, ScenarioEngine, load_all
from simcore.scenario import Zone
from simcore.sterile import SterileField, distance, inside

Z = Zone("t", "bàn", (0, 0, 0), (1, 1, 1))


def test_inside_and_distance():
    assert inside((0.5, 0.5, 0.5), Z) and not inside((1.5, 0.5, 0.5), Z)
    assert distance((0.5, 0.5, 0.5), Z) == 0
    assert abs(distance((1.3, 0.5, 0.5), Z) - 0.3) < 1e-9
    assert abs(distance((2, 2, 1), Z) - 2 ** 0.5) < 1e-9


def test_sterile_hand_may_touch_nonsterile_may_not():
    f = SterileField([Z], 0.3)
    assert f.contact((0.5, 0.5, 0.5), is_sterile=True) is None
    assert f.contact((0.5, 0.5, 0.5), is_sterile=False) is Z


def test_observer_distance_rule_only_for_non_gowned():
    f = SterileField([Z], 0.3)
    assert f.too_close((1.2, 0.5, 0.5), is_gowned=False)[0] is Z
    assert f.too_close((1.2, 0.5, 0.5), is_gowned=True) is None
    assert f.too_close((1.5, 0.5, 0.5), is_gowned=False) is None


def test_too_close_warning_has_cooldown():
    sc = load_all(Path(__file__).resolve().parents[1] / "scenarios")["m2_sterile_basics"]
    e = ScenarioEngine(sc)
    p = {"point": [1.6, 1.0, 0.8], "is_gowned": False}
    e.handle(Event(0, "u", "stu", "position", data=p))
    e.handle(Event(2, "u", "stu", "position", data=p))
    e.handle(Event(6, "u", "stu", "position", data=p))
    assert [i.t for i in e.issues] == [0, 6]
