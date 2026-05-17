import type { Product } from "@accucery/types";

export interface Scraper {
  search(query: string): Promise<Product[]>;
}
