import packageMetadata from '../../package.json';

export const APP_NAME = packageMetadata.name;
export const APP_VERSION = packageMetadata.version;
export const APP_USER_AGENT = `${APP_NAME}/${APP_VERSION}`;
