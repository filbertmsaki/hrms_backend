export interface HikvisionAcsEventItem {
  employeeNoString?: string;
  name?: string;
  cardNo?: string;
  serialNo?: string | number;
  major?: number | string;
  minor?: number | string;
  eventTime?: string;
  time?: string;
  currentVerifyMode?: string | number;
  readerNo?: number | string;
  doorNo?: number | string;
  [key: string]: unknown;
}

export interface HikvisionAcsEventResponse {
  AcsEvent?: {
    searchID?: string;
    responseStatusStrg?: string;
    responseStatus?: boolean;
    numOfMatches?: number;
    totalMatches?: number;
    InfoList?: HikvisionAcsEventItem[];
  };
  AcsEventInfoList?: HikvisionAcsEventItem[];
  [key: string]: unknown;
}
