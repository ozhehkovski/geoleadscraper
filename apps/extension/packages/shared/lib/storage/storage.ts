import { IAppStoreState } from './../../interfaces';
import { DATA_EXPORT_BASIC_FIELDS, DATA_EXPORT_FORMATS } from './../../enums';
import { config } from './../../config';

import { BaseStorage, createStorage, StorageType } from './base-storage';

type AppStorage = BaseStorage<IAppStoreState> & {
  update: (callback: (state: IAppStoreState) => IAppStoreState) => Promise<void>;
};

export const storage: AppStorage = {
  ...createStorage<IAppStoreState>(
    'store',
    {
      auto_download: false,
      request_interval: 5,
      export_format: DATA_EXPORT_FORMATS.CSV,
      export_fields: DATA_EXPORT_BASIC_FIELDS,
      backend_url: config.DEFAULT_BACKEND_URL,
      enrich_missing: false,
    },
    {
      storageType: StorageType.Local,
      liveUpdate: true,
    },
  ),
  update: async callback => {
    await storage.set((state: IAppStoreState) => ({ ...state, ...callback(state) }));
  },
};
