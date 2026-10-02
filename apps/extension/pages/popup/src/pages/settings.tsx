import { useEffect, useState } from 'react';

import { useStore } from '@chrome-extension/shared/hooks';

import { RadioGroup, Switch, Tabs, ToggleGroup } from './../components';
import {
  DATA_EXPORT_FIELDS_SELECT,
  DATA_EXPORT_FORMATS_SELECT,
} from '@chrome-extension/shared/enums';

const TABS = {
  GENERAL: 'general',
  EXPORT: 'export',
};

const data = {
  select: {
    export: DATA_EXPORT_FORMATS_SELECT,
    exportFields: DATA_EXPORT_FIELDS_SELECT,
  },
};

const Page = () => {
  return (
    <div>
      <Tabs.Root defaultValue={TABS.GENERAL}>
        <Tabs.List>
          <Tabs.Trigger value={TABS.GENERAL}>Settings</Tabs.Trigger>
          <Tabs.Trigger value={TABS.EXPORT}>Export</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value={TABS.GENERAL}>
          <SettingsGeneralView />
        </Tabs.Content>
        <Tabs.Content value={TABS.EXPORT}>
          <SettingsExportView />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
};

const SettingsGeneralView = () => {
  const store = useStore();

  const {
    export_format,
    auto_download,
    backend_url,
    enrich_missing,
  } = store.state || {};

  useEffect(() => {
    chrome.permissions?.contains?.({ origins: ['<all_urls>'] })
      .then(hasPermission => {
        if (!hasPermission && store.state?.enrich_missing) {
          store.update(state => ({ ...state, enrich_missing: false }));
        }
      })
      .catch(() => undefined);
  }, []);

  const handlers = {
    onFormatChange: (format: string) => {
      store.update(state => ({ ...state, export_format: format }));
    },
    onDownloadChange: (download: boolean): void => {
      store.update(state => ({ ...state, auto_download: download }));
    },
    onEnrichMissingChange: async (enrich: boolean): Promise<void> => {
      if (enrich && chrome?.permissions?.request) {
        try {
          const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
          if (!granted) {
            store.update(state => ({ ...state, enrich_missing: false }));
            return;
          }
        } catch {
          store.update(state => ({ ...state, enrich_missing: false }));
          return;
        }
      }
      store.update(state => ({ ...state, enrich_missing: enrich }));
    },
    onBackendChange: (url: string): void => {
      store.update(state => ({ ...state, backend_url: url.trim() }));
    },
  };

  return (
    <div className="flex flex-col gap-4 text-neutral-700 text-sm">
      <div>
        <span>1. Auto download the list after extracting complete.</span>
        <div className="mt-2">
          <Switch checked={auto_download} onCheckedChange={handlers.onDownloadChange} />
        </div>
      </div>
      <div>
        <span>2. The format used for exporting data.</span>
        <div className="mt-2">
          <RadioGroup.Root
            className="flex flex-row gap-3"
            value={export_format}
            onValueChange={handlers.onFormatChange}>
            {data.select.export.map(({ label, value }, key) => (
              <RadioGroup.Item key={key} id={value} value={value} label={label} />
            ))}
          </RadioGroup.Root>
        </div>
      </div>
      <div>
        <span>3. Enrich missing email / phone from websites (before export).</span>
        <div className="mt-2">
          <Switch checked={enrich_missing} onCheckedChange={handlers.onEnrichMissingChange} />
        </div>
      </div>
      <div>
        <span>4. Backend URL (optional) — enables website contact enrichment.</span>
        <input
          type="text"
          spellCheck={false}
          placeholder="http://localhost:5050"
          defaultValue={backend_url || ''}
          onBlur={e => handlers.onBackendChange(e.target.value)}
          className="mt-2 w-full rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
        />
        <p className="mt-1 text-xs text-neutral-500">
          The extension extracts contacts directly inside your browser. Optional: you can connect a local Puppeteer backend for advanced JS rendering.
        </p>
      </div>
    </div>
  );
};

interface IExportFieldItem {
  value: string;
  checked: boolean;
  label: string;
}

const SettingsExportView = () => {
  const store = useStore();
  const [items, setItems] = useState<IExportFieldItem[]>([]);

  const handleSelect = (items: IExportFieldItem[]) => {
    setItems(() => items);
    const fields = items.filter(({ checked }) => checked).map(({ value }) => value);
    store.update(state => ({ ...state, export_fields: fields }));
  };

  useEffect(() => {
    if (!store.state) return;
    const fields: string[] = store.state?.export_fields || [];
    setItems(() =>
      data.select.exportFields.map(item => ({ ...item, checked: fields.some(field => field === item.value) })),
    );
  }, [store.state]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <span className="text-sm">Click to select / unselect what you want to export.</span>
        <p className="mt-1 text-xs text-neutral-500">
          Enable &apos;Enrich missing email / phone&apos; in Settings to fill these fields from business websites before export.
        </p>
        <div className="mt-2">
          <ToggleGroup items={items} filter={items => items} onChange={handleSelect} />
        </div>
      </div>
    </div>
  );
};

export default Page;
