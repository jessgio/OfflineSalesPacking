import type { SociollaPoLine } from "./sociollaPoParser";

export interface SociollaProductRow {
  barcode: string;
  clean_name: string | null;
  sociolla_sku: string | null;
}

export interface SociollaMappedLine {
  sociollaSku: string;
  barcode: string;
  productName: string;
  targetQty: number;
  mapped: boolean;
}

export function mapSociollaLinesToProducts(
  lines: SociollaPoLine[],
  products: SociollaProductRow[]
): { mapped: SociollaMappedLine[]; unmappedSkus: string[] } {
  const bySociollaSku = new Map<string, SociollaProductRow>();
  for (const product of products) {
    if (product.sociolla_sku) {
      bySociollaSku.set(product.sociolla_sku.trim(), product);
    }
  }

  const unmappedSkus: string[] = [];
  const mapped: SociollaMappedLine[] = lines.map((line) => {
    const product = bySociollaSku.get(line.sociollaSku);
    if (!product?.barcode) {
      unmappedSkus.push(line.sociollaSku);
      return {
        sociollaSku: line.sociollaSku,
        barcode: line.sociollaSku,
        productName: line.description,
        targetQty: line.quantity,
        mapped: false,
      };
    }

    return {
      sociollaSku: line.sociollaSku,
      barcode: product.barcode,
      productName: product.clean_name || line.description,
      targetQty: line.quantity,
      mapped: true,
    };
  });

  return { mapped, unmappedSkus: [...new Set(unmappedSkus)] };
}
