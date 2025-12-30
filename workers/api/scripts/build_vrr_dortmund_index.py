#!/usr/bin/env python3
import argparse
import csv
import json
import os
import zipfile
from collections import Counter, defaultdict

def base_station_id(stop_id: str) -> str:
    if stop_id.endswith("_Parent"):
        stop_id = stop_id[: -len("_Parent")]
    parts = stop_id.split(":")
    if len(parts) >= 3:
        return ":".join(parts[:3])
    return stop_id


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Dortmund GTFS station index for VRR.")
    parser.add_argument("--gtfs-zip", required=True, help="Path to the VRR GTFS zip file.")
    parser.add_argument(
        "--output",
        default="workers/api/src/vrr-dortmund-index.ts",
        help="Output TypeScript file path.",
    )
    return parser.parse_args()


def read_csv_from_zip(zip_file: zipfile.ZipFile, name: str):
    with zip_file.open(name) as file:
        text_iter = (line.decode("utf-8", "replace") for line in file)
        reader = csv.DictReader(text_iter)
        for row in reader:
            yield row


def main() -> None:
    args = parse_args()
    zip_path = args.gtfs_zip
    output_path = args.output

    if not os.path.exists(zip_path):
        raise SystemExit(f"GTFS zip not found: {zip_path}")

    dortmund_prefix = "de:05913:"

    stop_name_by_id: dict[str, str] = {}
    station_entries: dict[str, dict] = {}

    with zipfile.ZipFile(zip_path) as zf:
        if "stops.txt" not in zf.namelist():
            raise SystemExit("stops.txt not found in GTFS zip")

        for row in read_csv_from_zip(zf, "stops.txt"):
            stop_id = (row.get("stop_id") or "").strip()
            stop_name = (row.get("stop_name") or "").strip()
            if not stop_id:
                continue

            stop_name_by_id[stop_id] = stop_name

            if not stop_id.startswith(dortmund_prefix):
                continue

            location_type = (row.get("location_type") or "").strip()
            parent_station = (row.get("parent_station") or "").strip()
            if location_type == "1":
                parent_station = stop_id

            base_id = base_station_id(parent_station or stop_id)
            entry = station_entries.setdefault(
                base_id,
                {
                    "id": base_id,
                    "name": "",
                    "lat": None,
                    "lon": None,
                    "stop_ids": set(),
                },
            )

            entry["stop_ids"].add(stop_id)

            if location_type == "1" and stop_name:
                entry["name"] = stop_name

            if entry["name"] == "" and stop_name:
                entry["name"] = stop_name

            if location_type == "1":
                lat = row.get("stop_lat")
                lon = row.get("stop_lon")
                if lat and lon:
                    entry["lat"] = float(lat)
                    entry["lon"] = float(lon)

            if entry["lat"] is None or entry["lon"] is None:
                lat = row.get("stop_lat")
                lon = row.get("stop_lon")
                if lat and lon:
                    entry["lat"] = float(lat)
                    entry["lon"] = float(lon)

        if "routes.txt" not in zf.namelist():
            raise SystemExit("routes.txt not found in GTFS zip")

        route_short_names: dict[str, str] = {}
        for row in read_csv_from_zip(zf, "routes.txt"):
            route_id = (row.get("route_id") or "").strip()
            short_name = (row.get("route_short_name") or "").strip()
            if route_id:
                route_short_names[route_id] = short_name or route_id

        if "trips.txt" not in zf.namelist():
            raise SystemExit("trips.txt not found in GTFS zip")

        trip_info: dict[str, tuple[str, str]] = {}
        for row in read_csv_from_zip(zf, "trips.txt"):
            trip_id = (row.get("trip_id") or "").strip()
            route_id = (row.get("route_id") or "").strip()
            direction_id = (row.get("direction_id") or "0").strip()
            if trip_id and route_id:
                trip_info[trip_id] = (route_id, direction_id)

        if "stop_times.txt" not in zf.namelist():
            raise SystemExit("stop_times.txt not found in GTFS zip")

        trip_first: dict[str, tuple[int, str]] = {}
        trip_last: dict[str, tuple[int, str]] = {}
        station_routes: dict[str, set[str]] = defaultdict(set)

        for row in read_csv_from_zip(zf, "stop_times.txt"):
            trip_id = (row.get("trip_id") or "").strip()
            stop_id = (row.get("stop_id") or "").strip()
            seq_raw = (row.get("stop_sequence") or "0").strip()
            if not trip_id or not stop_id:
                continue
            if trip_id not in trip_info:
                continue
            try:
                seq = int(seq_raw)
            except ValueError:
                continue

            if trip_id not in trip_first or seq < trip_first[trip_id][0]:
                trip_first[trip_id] = (seq, stop_id)
            if trip_id not in trip_last or seq > trip_last[trip_id][0]:
                trip_last[trip_id] = (seq, stop_id)

            if stop_id.startswith(dortmund_prefix):
                base_id = base_station_id(stop_id)
                route_id, direction_id = trip_info[trip_id]
                station_routes[base_id].add(f"{route_id}::{direction_id}")

        origin_counts: dict[str, Counter] = defaultdict(Counter)
        destination_counts: dict[str, Counter] = defaultdict(Counter)

        for trip_id, (route_id, direction_id) in trip_info.items():
            if trip_id not in trip_first or trip_id not in trip_last:
                continue
            first_stop = trip_first[trip_id][1]
            last_stop = trip_last[trip_id][1]
            key = f"{route_id}::{direction_id}"
            origin_name = stop_name_by_id.get(first_stop, "")
            destination_name = stop_name_by_id.get(last_stop, "")
            if origin_name:
                origin_counts[key][origin_name] += 1
            if destination_name:
                destination_counts[key][destination_name] += 1

        route_endpoints: dict[str, dict] = {}
        for key in set(origin_counts) | set(destination_counts):
            route_id, direction_id = key.split("::")
            line = route_short_names.get(route_id, route_id)
            origin = origin_counts[key].most_common(1)
            destination = destination_counts[key].most_common(1)
            if not origin or not destination:
                continue
            route_endpoints[key] = {
                "line": line,
                "origin": origin[0][0],
                "destination": destination[0][0],
            }

        routes_by_station: dict[str, list] = {}
        for station_id, keys in station_routes.items():
            route_list = []
            seen = set()
            for key in keys:
                endpoint = route_endpoints.get(key)
                if not endpoint:
                    continue
                route_key = (endpoint["line"], endpoint["origin"], endpoint["destination"])
                if route_key in seen:
                    continue
                seen.add(route_key)
                route_list.append(
                    {
                        "line": endpoint["line"],
                        "origin": endpoint["origin"],
                        "destination": endpoint["destination"],
                    }
                )
            route_list.sort(
                key=lambda item: (item["line"], item["destination"], item["origin"])
            )
            routes_by_station[station_id] = route_list

    stations = [
        {
            "id": entry["id"],
            "name": entry["name"],
            "lat": entry["lat"],
            "lon": entry["lon"],
        }
        for entry in station_entries.values()
        if entry["name"]
    ]
    stations.sort(key=lambda item: item["name"].lower())

    output = {
        "stations": stations,
        "routesByStationId": routes_by_station,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as file:
        file.write("// This file is generated by build_vrr_dortmund_index.py.\n")
        file.write("export const dortmundStationIndex = ")
        json.dump(output, file, ensure_ascii=False, indent=2)
        file.write(" as const;\n")

    print(f"Wrote {len(stations)} stations to {output_path}")


if __name__ == "__main__":
    main()
