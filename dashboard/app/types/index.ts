export interface Prediction {
  speaker: string;
  prediction: string;
  asset_type: string;
  ticker_or_name: string;
  direction: string;
  timeframe: string;
  confidence: string;
  timestamp: string;
  episode_title: string;
  episode_date: string;
  episode_url: string;
  video_link: string;
  price_ticker?: string;
  source?: "allin" | "bg2" | "external";
  source_name?: string;
}
