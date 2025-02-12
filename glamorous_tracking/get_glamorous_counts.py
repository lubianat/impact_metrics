#!/usr/bin/env python3
import xml.etree.ElementTree as ET
import csv
import datetime
import os
import requests

# URL to fetch the XML data
XML_URL = 'https://glamtools.toolforge.org/glamorous.php?doit=1&category=Files+from+the+Biodiversity+Heritage+Library&use_globalusage=1&show_details=1&projects[wikipedia]=1&projects[wikibooks]=1&projects[wikispecies]=1&projects[wikidata]=1&projects[wikiversity]=1&format=xml'

def fetch_xml(url):
    """
    Fetch the XML data from the given URL.
    """
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.content
    except requests.RequestException as e:
        print(f"Error fetching XML data: {e}")
        return None

def parse_xml(xml_data):
    """
    Parse the XML data and extract usage counts for each language-project pair.
    """
    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError as e:
        print(f"Error parsing XML data: {e}")
        return None, None

    # Get the category from the root attribute (or use a default)
    category = root.attrib.get('category', 'Unknown')

    # Initialize a dictionary to store usage counts for each project
    usage_counts = {}

    # Find the <stats> element
    stats = root.find('stats')
    if stats is None:
        print("No <stats> element found in the XML.")
        return category, usage_counts

    # Iterate over each <usage> element in <stats>
    for usage in stats.findall('usage'):
        project = usage.attrib.get('project', '')
        try:
            usage_count = int(usage.attrib.get('usage_count', '0'))
        except ValueError:
            usage_count = 0

        # Store the usage count for the project
        usage_counts[project] = usage_count

    return category, usage_counts

def update_tsv(output_file, category, usage_counts):
    """
    Append a new row to the TSV file with the usage counts for each project.
    If the file does not exist yet, write a header row first.
    """
    # Define the base columns
    base_columns = ['category', 'date']

    # Check if the file exists
    file_exists = os.path.isfile(output_file)

    if file_exists:
        # Read the existing columns from the TSV file
        with open(output_file, 'r', newline='', encoding='utf-8') as f:
            reader = csv.reader(f, delimiter='\t')
            existing_columns = next(reader)
    else:
        existing_columns = base_columns

    # Get the current date
    current_date = datetime.datetime.now().strftime("%Y-%m-%d")

    # Create a set of all columns needed (existing + new)
    all_columns = set(existing_columns)

    # Add new columns for any new projects found
    for project in usage_counts.keys():
        if project not in all_columns:
            all_columns.add(project)

    # Sort columns: base columns first, then project columns sorted alphabetically
    sorted_columns = base_columns + sorted(all_columns - set(base_columns))

    # Prepare the row data
    row = {
        'category': category,
        'date': current_date,
    }
    row.update(usage_counts)

    # Write the updated TSV file
    with open(output_file, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=sorted_columns, delimiter='\t')

        # Write the header if the file is new
        if not file_exists:
            writer.writeheader()

        # Write the row
        writer.writerow(row)

    print(f"Updated {output_file} with today's data.")

def main():
    from pathlib import Path
    HERE = Path(__file__).parent
    output_file = HERE/ 'usage.tsv'  # The TSV file to update

    # Fetch the XML data
    xml_data = fetch_xml(XML_URL)
    if xml_data is None:
        print("Failed to fetch XML data. Exiting.")
        return

    # Parse the XML data
    category, usage_counts = parse_xml(xml_data)
    if category is None or usage_counts is None:
        print("Parsing failed. Exiting.")
        return

    # Update the TSV file
    update_tsv(output_file, category, usage_counts)

if __name__ == "__main__":
    main()
