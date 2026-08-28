#!/usr/bin/env bash
# Builds the full-dataset GIS downloads from the authoritative CSVs using GDAL
# (>= 3.6 for OpenFileGDB write). Runs in CI (data-exports.yml) on every data
# change; runs locally too if you have gdal-bin installed.
#
#   bash scripts/build-exports.sh   ->  exports/ (zips + gpkg)
set -euo pipefail

command -v ogr2ogr >/dev/null || { echo "ogr2ogr (gdal-bin) is required"; exit 1; }
rm -rf exports && mkdir -p exports/work

# longitude/latitude stay as attribute columns AND drive point geometry; rows
# with blank coordinates get null geometry (kept in GPKG/FileGDB, filtered out
# of shapefiles, which handle null geometry poorly).
CSV_OPTS=(-oo X_POSSIBLE_NAMES=longitude -oo Y_POSSIBLE_NAMES=latitude)

# --- Shapefiles (located records only; DBF names truncate to 10 chars) -------
mkdir -p exports/work/shapefiles
ogr2ogr -f "ESRI Shapefile" exports/work/shapefiles/resst_sites.shp data/sites.csv \
  "${CSV_OPTS[@]}" -a_srs EPSG:4326 -where "longitude is not null and longitude != ''" -nln resst_sites
ogr2ogr -f "ESRI Shapefile" exports/work/shapefiles/resst_literature.shp data/literature.csv \
  "${CSV_OPTS[@]}" -a_srs EPSG:4326 -where "longitude is not null and longitude != ''" -nln resst_literature
(cd exports/work/shapefiles && zip -q ../../resst-shapefiles.zip ./*)

# --- GeoPackage: all four tables in one file --------------------------------
GPKG=exports/resst.gpkg
ogr2ogr -f GPKG "$GPKG" data/sites.csv "${CSV_OPTS[@]}" -a_srs EPSG:4326 -nln sites
ogr2ogr -f GPKG -update "$GPKG" data/literature.csv "${CSV_OPTS[@]}" -a_srs EPSG:4326 -nln literature
ogr2ogr -f GPKG -update "$GPKG" data/literature_entries.csv -nln literature_entries -nlt NONE
ogr2ogr -f GPKG -update "$GPKG" data/nid_snapshot.csv -nln nid_snapshot -nlt NONE

# --- File Geodatabase (OpenFileGDB write, GDAL >= 3.6) ----------------------
GDB=exports/work/resst.gdb
ogr2ogr -f OpenFileGDB "$GDB" data/sites.csv "${CSV_OPTS[@]}" -a_srs EPSG:4326 -nln sites
ogr2ogr -f OpenFileGDB -update "$GDB" data/literature.csv "${CSV_OPTS[@]}" -a_srs EPSG:4326 -nln literature
ogr2ogr -f OpenFileGDB -update "$GDB" data/literature_entries.csv -nln literature_entries -nlt NONE
ogr2ogr -f OpenFileGDB -update "$GDB" data/nid_snapshot.csv -nln nid_snapshot -nlt NONE
(cd exports/work && zip -qr ../resst-filegdb.zip resst.gdb)

# --- CSV bundle (the authoritative source, verbatim) ------------------------
zip -qj exports/resst-csv.zip data/sites.csv data/literature.csv data/literature_entries.csv data/nid_snapshot.csv data/MIGRATION-LOG.md

# --- Report -----------------------------------------------------------------
echo "== exports =="
ls -l exports/*.zip exports/*.gpkg
for layer in sites literature literature_entries nid_snapshot; do
  n=$(ogrinfo -ro -so "$GPKG" "$layer" | awk -F': ' '/Feature Count/ {print $2}')
  echo "gpkg $layer: $n features"
done
rm -rf exports/work
