export interface Expert {
  id: string;
  name: string;
  aliases: string[];
  role: string;
  own_channels: string[];
  known_podcasts: string[];
  search_terms: string[];
  tags: string[];
}
