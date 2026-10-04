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
