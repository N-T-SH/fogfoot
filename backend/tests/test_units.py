import geopandas as gpd
import pytest
from pyproj import Transformer
from shapely.geometry import LineString, Polygon

from fogfoot.config import load_settings
from fogfoot.network.units import assign_wards, build_units, offset_kerbs, split_units

CFG = load_settings()
TO_LL = Transformer.from_crs(CFG.units.projected_crs, 4326, always_xy=True)
X0, Y0 = 779000.0, 1432000.0  # a point in UTM 43N, roughly central Bengaluru


def _road(coords, osm_id, highway="secondary", oneway=False, name="Test Rd"):
    ll = [TO_LL.transform(x, y) for x, y in coords]
    return {"osm_way_id": osm_id, "highway": highway, "name": name, "oneway": oneway, "sidewalk_tag": None, "geometry": LineString(ll)}


def _roads(*rows):
    return gpd.GeoDataFrame(list(rows), geometry="geometry", crs=4326)


def _ward(x0, y0, x1, y1):
    pts = [TO_LL.transform(x, y) for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]]
    return gpd.GeoDataFrame([{"ward_key": "w1", "ward_name": "Test", "corporation": "C"}], geometry=[Polygon(pts)], crs=4326)


def test_two_way_road_gets_a_kerb_each_side_at_configured_offset():
    roads = _roads(_road([(X0, Y0), (X0 + 500, Y0)], 1, "secondary"))  # eastbound, offset 7 m
    kerbs = offset_kerbs(roads, CFG)
    assert sorted(kerbs["side"]) == ["L", "R"]
    left = kerbs[kerbs.side == "L"].geometry.iloc[0]
    right = kerbs[kerbs.side == "R"].geometry.iloc[0]
    # heading east: left is north (+y), right is south (-y)
    assert left.centroid.y == pytest.approx(Y0 + 7, abs=0.01)
    assert right.centroid.y == pytest.approx(Y0 - 7, abs=0.01)


def test_units_are_about_100m_with_stable_ids():
    roads = _roads(_road([(X0, Y0), (X0 + 500, Y0)], 42, "residential"))
    units = split_units(offset_kerbs(roads, CFG), CFG)
    assert len(units) == 10  # 5 x 100 m per side
    assert set(units["unit_id"]) == {f"42_{i}_{s}" for i in range(5) for s in "LR"}
    assert units["length_m"].between(95, 105).all()


def test_short_stubs_are_dropped_and_odd_lengths_are_split_evenly():
    roads = _roads(_road([(X0, Y0), (X0 + 20, Y0)], 1, "residential"), _road([(X0, Y0 + 50), (X0 + 250, Y0 + 50)], 2, "residential"))
    units = split_units(offset_kerbs(roads, CFG), CFG)
    assert 1 not in set(units["osm_way_id"])           # 20 m < min_length_m
    two = units[units.osm_way_id == 2]
    assert len(two) == 2 * 2                          # 250 m -> round(2.5)=2 pieces of 125 m per side
    assert two["length_m"].between(120, 130).all()


def test_dual_carriageway_median_side_dropped():
    # Two one-way carriageways 14 m apart, opposing directions. India drives on the left, so for the
    # eastbound way the right (south) kerb faces the median; for westbound the right (north) kerb does.
    east = _road([(X0, Y0), (X0 + 300, Y0)], 10, "primary", oneway=True)
    west = _road([(X0 + 300, Y0 - 14), (X0, Y0 - 14)], 11, "primary", oneway=True)
    kerbs = offset_kerbs(_roads(east, west), CFG)
    assert sorted(zip(kerbs.osm_way_id, kerbs.side)) == [(10, "L"), (11, "L")]


def test_lone_oneway_street_keeps_both_sides():
    kerbs = offset_kerbs(_roads(_road([(X0, Y0), (X0 + 300, Y0)], 5, "residential", oneway=True)), CFG)
    assert sorted(kerbs["side"]) == ["L", "R"]


def test_median_dropping_can_be_disabled():
    cfg = CFG.model_copy(deep=True); cfg.units.drop_median_side = False
    east = _road([(X0, Y0), (X0 + 300, Y0)], 10, "primary", oneway=True)
    west = _road([(X0 + 300, Y0 - 14), (X0, Y0 - 14)], 11, "primary", oneway=True)
    assert len(offset_kerbs(_roads(east, west), cfg)) == 4


def test_units_outside_pilot_wards_are_removed():
    inside = _road([(X0, Y0), (X0 + 300, Y0)], 1, "residential")
    outside = _road([(X0, Y0 + 2000), (X0 + 300, Y0 + 2000)], 2, "residential")
    ward = _ward(X0 - 50, Y0 - 500, X0 + 400, Y0 + 500)
    units = build_units(_roads(inside, outside), ward, CFG)
    assert set(units["osm_way_id"]) == {1}
    assert (units["ward_key"] == "w1").all()


def test_curved_road_units_follow_the_curve():
    import numpy as np
    arc = [(X0 + 200 * np.sin(t), Y0 + 200 * (1 - np.cos(t))) for t in np.linspace(0, 1.2, 40)]
    units = split_units(offset_kerbs(_roads(_road(arc, 7, "tertiary")), CFG), CFG)
    assert len(units) == 4  # 240 m arc -> 2 units per side
    # every unit midpoint should sit ~5.5 m (tertiary) from the road centreline
    centre = LineString(arc)
    for _, u in units.iterrows():
        assert u.geometry.interpolate(0.5, normalized=True).distance(centre) == pytest.approx(5.5, abs=0.6)


def test_pilot_ward_patterns_match_whole_words_only():
    from fogfoot.network.wards import pilot_wards
    wards = gpd.GeoDataFrame({"ward_name": ["Agara", "Hoysala Nagara Central", "Kormangala East", "HSR Layout", "Agaram"]},
                             geometry=[Polygon()] * 5, crs=4326)
    got = set(pilot_wards(wards, ["Agara", "Kormangala", "HSR Layout"])["ward_name"])
    assert got == {"Agara", "Kormangala East", "HSR Layout"}


def test_wide_median_is_still_detected():
    east = _road([(X0, Y0), (X0 + 300, Y0)], 10, "primary", oneway=True)
    west = _road([(X0 + 300, Y0 - 26), (X0, Y0 - 26)], 11, "primary", oneway=True)   # 26 m apart
    kerbs = offset_kerbs(_roads(east, west), CFG)
    assert sorted(zip(kerbs.osm_way_id, kerbs.side)) == [(10, "L"), (11, "L")]


def test_paired_oneway_side_streets_with_different_names_keep_both_kerbs():
    a = _road([(X0, Y0), (X0 + 300, Y0)], 20, "residential", oneway=True, name="1st Cross")
    b = _road([(X0 + 300, Y0 - 25), (X0, Y0 - 25)], 21, "residential", oneway=True, name="2nd Cross")
    assert len(offset_kerbs(_roads(a, b), CFG)) == 4


def test_unnamed_oneway_keeps_both_kerbs():
    a = _road([(X0, Y0), (X0 + 300, Y0)], 30, "primary", oneway=True, name=None)
    b = _road([(X0 + 300, Y0 - 14), (X0, Y0 - 14)], 31, "primary", oneway=True, name=None)
    assert len(offset_kerbs(_roads(a, b), CFG)) == 4


# ---- shared streets (narrow lanes) -------------------------------------------------------------

def _buildings(*boxes):
    from shapely.geometry import box
    return gpd.GeoDataFrame(geometry=[box(*b) for b in boxes], crs=CFG.units.projected_crs).to_crs(4326)


def _lane_with_buildings(gap, road_id=1, highway="residential", length=240, one_side_only=False):
    """East-west road along y=Y0 with continuous building rows `gap` metres apart (face to face)."""
    roads = _roads(_road([(X0, Y0), (X0 + length, Y0)], road_id, highway))
    rows = [(X0 - 10, Y0 + gap / 2, X0 + length + 10, Y0 + gap / 2 + 8)]
    if not one_side_only:
        rows.append((X0 - 10, Y0 - gap / 2 - 8, X0 + length + 10, Y0 - gap / 2))
    return roads, _buildings(*rows)


def test_narrow_lane_becomes_one_shared_unit_per_100m_on_the_centreline():
    roads, bld = _lane_with_buildings(gap=5.0)
    units = build_units(roads, _ward(X0 - 50, Y0 - 100, X0 + 400, Y0 + 100), CFG, buildings=bld)
    assert set(units["side"]) == {"C"} and set(units["kind"]) == {"shared"}
    assert len(units) == 2                        # 240 m -> round(2.4)=2 pieces, not 4 (2 per side)
    proj = units.to_crs(CFG.units.projected_crs)
    assert all(abs(g.centroid.y - Y0) < 0.05 for g in proj.geometry)   # on the centreline, not offset to a kerb
    assert (units["gap_m"] == 5.0).all()
    assert set(units["unit_id"]) == {"1_0_C", "1_1_C"}


def test_wider_street_keeps_two_kerbs():
    roads, bld = _lane_with_buildings(gap=14.0)
    units = build_units(roads, _ward(X0 - 50, Y0 - 100, X0 + 400, Y0 + 100), CFG, buildings=bld)
    assert set(units["side"]) == {"L", "R"} and set(units["kind"]) == {"kerb"}


def test_lane_with_buildings_on_one_side_only_is_not_shared():
    roads, bld = _lane_with_buildings(gap=5.0, one_side_only=True)
    units = build_units(roads, _ward(X0 - 50, Y0 - 100, X0 + 400, Y0 + 100), CFG, buildings=bld)
    assert set(units["side"]) == {"L", "R"}


def test_main_roads_are_never_shared_even_when_hemmed_in():
    roads, bld = _lane_with_buildings(gap=5.0, highway="secondary")
    units = build_units(roads, _ward(X0 - 50, Y0 - 100, X0 + 400, Y0 + 100), CFG, buildings=bld)
    assert set(units["side"]) == {"L", "R"}


def test_without_building_data_nothing_is_shared():
    roads, _ = _lane_with_buildings(gap=5.0)
    units = build_units(roads, _ward(X0 - 50, Y0 - 100, X0 + 400, Y0 + 100), CFG)
    assert set(units["side"]) == {"L", "R"}


def test_shared_streets_can_be_disabled():
    cfg = CFG.model_copy(deep=True); cfg.units.shared_streets.enabled = False
    roads, bld = _lane_with_buildings(gap=5.0)
    units = build_units(roads, _ward(X0 - 50, Y0 - 100, X0 + 400, Y0 + 100), cfg, buildings=bld)
    assert set(units["side"]) == {"L", "R"}


def test_gap_is_measured_not_assumed_lane_gaps_between_threshold_and_wide():
    from fogfoot.network.shared import shared_street_gaps
    ru = _lane_with_buildings(gap=7.5)[0].to_crs(CFG.units.projected_crs)
    bu = _lane_with_buildings(gap=7.5)[1].to_crs(CFG.units.projected_crs)
    g = shared_street_gaps(ru, bu, CFG.units.shared_streets)
    assert g[1] == pytest.approx(7.5, abs=0.2)
    ru, bu = [d.to_crs(CFG.units.projected_crs) for d in _lane_with_buildings(gap=8.6)]
    assert shared_street_gaps(ru, bu, CFG.units.shared_streets) == {}   # just over max_gap_m=8.0


# ---- Overpass retry behaviour -------------------------------------------------------------------

class _Resp:
    def __init__(self, code, body=None, text=""):
        self.status_code, self._body, self.text = code, body, text

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body


def _run_post(monkeypatch, responses):
    import fogfoot.network.osm as osm
    calls = []
    it = iter(responses)

    def fake_post(url, **kw):
        calls.append(url)
        r = next(it)
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(osm.requests, "post", fake_post)
    waits = []
    return osm, calls, waits


def test_overpass_rotates_endpoints_and_reports_statuses(monkeypatch):
    osm, calls, waits = _run_post(monkeypatch, [_Resp(429), _Resp(504), _Resp(200, {"elements": [1]})])
    out = osm._post_overpass(CFG, "q", sleep=waits.append)
    assert out == {"elements": [1]}
    assert calls == CFG.osm.overpass_urls[:3]            # rotated across the three endpoints
    assert waits == CFG.osm.retry_waits_s[:2]            # backed off between attempts


def test_overpass_error_names_the_status_codes(monkeypatch):
    osm, _, waits = _run_post(monkeypatch, [_Resp(429)] * 10)
    with pytest.raises(RuntimeError) as e:
        osm._post_overpass(CFG, "q", sleep=waits.append)
    assert "HTTP 429" in str(e.value) and "None" not in str(e.value)


def test_overpass_does_not_retry_a_bad_query(monkeypatch):
    osm, calls, waits = _run_post(monkeypatch, [_Resp(400), _Resp(200, {})])
    with pytest.raises(RuntimeError, match="HTTP 400"):
        osm._post_overpass(CFG, "q", sleep=waits.append)
    assert len(calls) == 1


def test_overpass_html_error_page_with_200_is_retried(monkeypatch):
    osm, _, waits = _run_post(monkeypatch, [_Resp(200, None, "<html>runtime error</html>"), _Resp(200, {"elements": []})])
    assert osm._post_overpass(CFG, "q", sleep=waits.append) == {"elements": []}
