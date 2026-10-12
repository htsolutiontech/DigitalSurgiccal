"""Vùng vô khuẩn dạng hộp (AABB) trong toạ độ phòng mổ (mét, trục y hướng lên).

Bản Unreal dùng va chạm vật lý (USterileFieldComponent); bản Python này dùng hình học đơn giản
để kiểm thử logic chấm điểm và để chạy mô phỏng không cần engine.
"""
from __future__ import annotations

import math
from typing import Iterable, Optional, Sequence

from .scenario import Zone

Vec3 = Sequence[float]


def inside(p: Vec3, z: Zone) -> bool:
    return all(z.min[i] <= p[i] <= z.max[i] for i in range(3))


def distance(p: Vec3, z: Zone) -> float:
    """Khoảng cách Euclid từ điểm tới hộp; bằng 0 nếu điểm nằm trong hộp."""
    d2 = 0.0
    for i in range(3):
        if p[i] < z.min[i]:
            d2 += (z.min[i] - p[i]) ** 2
        elif p[i] > z.max[i]:
            d2 += (p[i] - z.max[i]) ** 2
    return math.sqrt(d2)


class SterileField:
    def __init__(self, zones: Iterable[Zone], min_observer_distance_m: Optional[float] = None):
        self.zones = tuple(zones)
        self.min_observer_distance_m = min_observer_distance_m

    def contact(self, point: Vec3, is_sterile: bool) -> Optional[Zone]:
        """Trả về vùng bị nhiễm nếu một bộ phận KHÔNG vô khuẩn chạm vào vùng vô khuẩn."""
        if is_sterile:
            return None
        for z in self.zones:
            if inside(point, z):
                return z
        return None

    def too_close(self, point: Vec3, is_gowned: bool) -> Optional[tuple[Zone, float]]:
        """Người không mặc áo vô khuẩn đứng gần vùng vô khuẩn hơn khoảng cách tối thiểu."""
        if is_gowned or self.min_observer_distance_m is None:
            return None
        best = None
        for z in self.zones:
            d = distance(point, z)
            if d < self.min_observer_distance_m and (best is None or d < best[1]):
                best = (z, d)
        return best
