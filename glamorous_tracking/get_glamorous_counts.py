#!/usr/bin/env python3
import xml.etree.ElementTree as ET
import csv
import datetime
import os
import requests
from pathlib import Path

# URL to fetch the XML data
XML_URL = 'https://glamtools.toolforge.org/glamorous.php?doit=1&category=Files+from+the+Biodiversity+Heritage+Library&use_globalusage=1&show_details=1&projects[wikipedia]=1&projects[wikibooks]=1&projects[wikispecies]=1&projects[wikidata]=1&projects[wikiversity]=1&format=xml'

def fetch_xml(url):
    """Fetch XML data from the provided URL."""
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.content
    except requests.RequestException as e:
        print(f"Error fetching XML data: {e}")
        return None

def parse_xml(xml_data):
    """Parse XML data and extract usage counts for each project."""
    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError as e:
        print(f"Error parsing XML data: {e}")
        return None, None

    category = root.attrib.get('category', 'Unknown')
    usage_counts = {}

    stats = root.find('stats')
    if stats is None:
        print("No <stats> element found in XML.")
        return category, usage_counts

    for usage in stats.findall('usage'):
        project = usage.attrib.get('project', '')
        try:
            usage_count = int(usage.attrib.get('usage_count', '0'))
        except ValueError:
            usage_count = 0
        usage_counts[project] = usage_count

    return category, usage_counts

def update_tsv(output_file, category, usage_counts):
    """Update the TSV file with new data, ensuring all columns exist."""
    base_columns = ['category', 'date']
    
    # Ensure the TSV file exists
    file_exists = output_file.exists()
    
    if file_exists:
        with open(output_file, 'r', newline='', encoding='utf-8') as f:
            reader = csv.reader(f, delimiter='\t')
            existing_columns = next(reader)
    else:
        existing_columns = base_columns

    current_date = datetime.datetime.now().strftime("%Y-%m-%d")
    all_columns = set(existing_columns) | set(usage_counts.keys())
    sorted_columns = base_columns + sorted(all_columns - set(base_columns))

    row = {'category': category, 'date': current_date, **usage_counts}

    with open(output_file, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=sorted_columns, delimiter='\t')

        if not file_exists:
            writer.writeheader()

        writer.writerow(row)

    print(f"Updated {output_file} with today's data.")

def main():
    HERE = Path(__file__).parent
    output_file = HERE / 'usage.tsv'

    xml_data = fetch_xml(XML_URL)
    if not xml_data:
        print("Failed to fetch XML. Exiting.")
        return

    category, usage_counts = parse_xml(xml_data)
    if category is None or usage_counts is None:
        print("Parsing failed. Exiting.")
        return

    update_tsv(output_file, category, usage_counts)

if __name__ == "__main__":
    main()
