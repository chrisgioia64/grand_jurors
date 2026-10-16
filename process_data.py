import csv
import pandas as pd

def process():
    # 1. Aggregate demographics_aggregate.csv -> demographics_aggregate_v2.csv
    with open('demographics_aggregate.csv', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        agg_rows = list(reader)

    new_agg_rows = []
    agg_age_acc = {}
    agg_age_seen = set()

    for r in agg_rows:
        src, cat, sub = r['Data Source'], r['Category'], r['Subcategory']
        count = int(r['Total_Count'])
        if cat == 'Age Range' and sub in ['45-54', '45-64', '55-64']:
            key = (src, cat)
            agg_age_acc[key] = agg_age_acc.get(key, 0) + count
            if key not in agg_age_seen:
                agg_age_seen.add(key)
                new_agg_rows.append({'Data Source': src, 'Category': cat, 'Subcategory': '45-64', 'Total_Count': None})
            continue
        new_agg_rows.append(r)

    for r in new_agg_rows:
        if r['Category'] == 'Age Range' and r['Subcategory'] == '45-64' and r['Total_Count'] is None:
            r['Total_Count'] = agg_age_acc[(r['Data Source'], r['Category'])]

    with open('demographics_aggregate_v2.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['Data Source', 'Category', 'Subcategory', 'Total_Count'], lineterminator='\r\n')
        writer.writeheader()
        writer.writerows(new_agg_rows)

    # 2. Raw demographics_raw.csv -> demographics_raw_v2.csv
    with open('demographics_raw.csv', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        raw_rows = list(reader)

    new_raw_rows = []
    raw_age_acc = {}
    raw_age_seen = set()

    for r in raw_rows:
        src, yr, cat, sub = r['Data Source'], r['Year'], r['Category'], r['Subcategory']
        count = int(r['Count']) if r['Count'] != '' else 0
        if cat == 'Age Range' and sub in ['45-54', '45-64', '55-64']:
            key = (src, yr, cat)
            raw_age_acc[key] = raw_age_acc.get(key, 0) + count
            if key not in raw_age_seen:
                raw_age_seen.add(key)
                new_raw_rows.append({'Data Source': src, 'Year': yr, 'Category': cat, 'Subcategory': '45-64', 'Count': None})
            continue
        new_raw_rows.append(r)

    for r in new_raw_rows:
        if r['Category'] == 'Age Range' and r['Subcategory'] == '45-64' and r['Count'] is None:
            r['Count'] = raw_age_acc[(r['Data Source'], r['Year'], r['Category'])]

    with open('demographics_raw_v2.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['Data Source', 'Year', 'Category', 'Subcategory', 'Count'], lineterminator='\r\n')
        writer.writeheader()
        writer.writerows(new_raw_rows)

    # 3. Convert v2 CSVs to JSON using pandas for the web visualizer
    df_raw = pd.read_csv('demographics_raw_v2.csv')
    df_raw.to_json('demographics_raw.json', orient='records', indent=2)

    df_agg = pd.read_csv('demographics_aggregate_v2.csv')
    df_agg.to_json('demographics_aggregate.json', orient='records', indent=2)

    print('Generated demographics_aggregate_v2.csv, demographics_raw_v2.csv, and updated JSON files.')

if __name__ == '__main__':
    process()
