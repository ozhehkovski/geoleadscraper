import { createContext } from 'react';
import type { DataParsingMode, DataPlatform } from '@chrome-extension/shared';
import { DATA_EXPORT_FORMATS, DATA_PARSING_MODES } from '@chrome-extension/shared/enums';

export interface IContentContextState {
  position: 'left' | 'right';
  platform: DataPlatform | null;
  mode: DataParsingMode;
  results: number;
  search: string | null;
  data: any[];
  initiated: boolean;
  completed: boolean;
  last?: { page: number; key: number };
  paused: boolean;
  extracting: boolean;
  page: number;
  pages: number;
  current: number;
  total: number;
  /** Whether an optional backend is reachable for website contact enrichment. */
  backend_available?: boolean;
  extract_websites: boolean;
  request_interval: number;
  auto_download: boolean;
  export_format: string;
  export_fields: string[];
  /** Before export, fill missing email/phone by scraping each business website. */
  enrich_missing?: boolean;
}

export interface IContentContext {
  context: IContentContextState;
  setContext: (state: Partial<IContentContextState>) => void;
}

export const ContentContext = createContext<IContentContext>({
  context: {
    position: 'right',
    platform: null,
    mode: DATA_PARSING_MODES.INTERVAL,
    search: null,
    data: [],
    results: 0,
    page: 1,
    pages: 0,
    current: 0,
    total: 0,
    initiated: false,
    paused: false,
    completed: false,
    extracting: false,
    extract_websites: false,
    auto_download: false,
    export_format: DATA_EXPORT_FORMATS.CSV,
    export_fields: [],
    enrich_missing: false,
    request_interval: 5000,
  },
  setContext: () => {},
});
