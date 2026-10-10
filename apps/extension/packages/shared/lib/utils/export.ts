import * as xlsx from 'xlsx';

import { DATA_EXPORT_FIELDS, DATA_EXPORT_FORMATS } from './../../enums';
import { dateformat } from './date';
import { arrayToCSV } from './format';

export const matchExportResults = (entries: string[]): string[] => {
  const values = Object.values(DATA_EXPORT_FIELDS);
  const fields: string[] = [];

  if (!Array.isArray(entries)) return fields;

  for (const entry of entries) {
    if (values.includes(entry)) {
      fields.push(entry);
    } else {
      continue;
    }
  }

  return fields;
};

export const filterExportResults = ({
  data,
  fields,
}: {
  data: Record<string, number | string | boolean | undefined>[];
  fields: string[];
}) => {
  // filter the objects in the list based on the fields
  if (fields.length) {
    data = data.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => fields.includes(key))));
  }

  return data;
};

interface IExportResultsOptions {
  data: Record<string, number | string | boolean | undefined>[];
  format: string;
  fields?: string[];
  prefix?: string;
}

export const exportResults = (options: IExportResultsOptions) => {
  const { format = DATA_EXPORT_FORMATS.CSV, prefix = 'data-export', data, fields } = options;

  const timestamp = dateformat().format('YYYYMMDDHHmmss');
  const filename = `${prefix}-${timestamp}`;

  switch (format) {
    case DATA_EXPORT_FORMATS.CSV:
      return exportCSV({ filename, data, fields });
    case DATA_EXPORT_FORMATS.JSON:
      return exportJSON({ filename, data, fields });
    case DATA_EXPORT_FORMATS.XLSX:
      return exportXLSX({ filename, data, fields });
  }
};

interface IExportResultsFormatBaseOptions {
  filename: string;
  data: Record<string, number | string | boolean | undefined>[];
  fields?: string[];
}

export const exportCSV = ({ filename, data = [], fields = [] }: IExportResultsFormatBaseOptions) => {
  // filter the objects in the list based on the fields
  data = filterExportResults({ data, fields });

  // convert the filtered list to csv
  const csv = arrayToCSV({
    fields,
    data,
  });

  // download the file
  if (csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

export const exportJSON = ({ filename, data = [], fields = [] }: IExportResultsFormatBaseOptions) => {
  // filter the objects in the list based on the fields
  data = filterExportResults({ data, fields });

  // convert the filtered data to JSON string
  const json = JSON.stringify(data, null, 2);

  // download the file
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportXLSX = ({ filename, data = [], fields = [] }: IExportResultsFormatBaseOptions) => {
  // filter the objects in the list based on the fields
  data = filterExportResults({ data, fields });

  // create a new workbook and add a worksheet
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(data, fields.length ? { header: fields } : undefined);

  // add the worksheet to the workbook
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  // generate XLSX file and create object URL
  const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);

  // download the file
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.xlsx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
