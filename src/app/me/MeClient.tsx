// Moved to ../whoami/WhoAmIClient when /me was renamed to /whoami.
// The /me route is now a redirect and no longer imports this; retained
// only as a re-export shim and safe to delete.
export { WhoAmIClient as MeClient } from '../whoami/WhoAmIClient';
