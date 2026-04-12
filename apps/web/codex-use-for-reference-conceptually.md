### `packages/seed`

An accidental prisma-grade data-seeding method with full typescript prowess built in

Consider the following bit of code from the Items service of the Wallet repo:

```ts
export class ItemsService<
  T extends keyof ProductDataFull = keyof ProductDataFull
> extends ItemSeeder<T> {
  protected readonly catalogMap: Map<string, CatalogItem>;
  protected readonly catalogItems: CatalogItem[];

  constructor() {
    super();
    // Load from dynamically generated seed data
    this.catalogItems = seededData.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price
    }));

    this.catalogMap = new Map(this.catalogItems.map(item => [item.id, item]));
  }

  public async reusableFetching() {
    return await this.reusableFetch("products", {
      limit: 30,
      order: "desc",
      select: ["category", "title", "id"]
    });
  }
//...  
}
```

the `reusableFetch` method has a type definition that updates by the keystroke -- 👀

On first hover (and first hover, the reusableFetching method wrapping it has a return type appears as follows):

```ts
(method) ItemsService<T extends keyof ProductDataFull = keyof ProductDataFull>.reusableFetching(): Promise<{
    products: Rm<ProductDataFull, "description" | "price" | "discountPercentage" | "rating" | "stock" | "tags" | "sku" | "weight" | "dimensions" | "warrantyInformation" | "shippingInformation" | "availabilityStatus" | "reviews" | "returnPolicy" | "minimumOrderQuantity" | "meta" | "images" | "thumbnail" | "brand">[];
    total: number;
    skip: number;
    limit: number;
}>
```

if you expand the deepth and look more closely, typescript paints its derived RT right there for you -- no generic passing required. just simple method usage, all batteries included for seed-data gen

```ts
(method) ItemsService<T extends keyof ProductDataFull = keyof ProductDataFull>.reusableFetching(): Promise<{
    products: {
        id: number;
        title: string;
        category: string;
    }[];
    total: number;
    skip: number;
    limit: number;
}>
```

to show you what I mean, I added these fields arbirtrarily (say we wanted to enrich test data):

```ts
  public async reusableFetching() {
    return await this.reusableFetch("products", {
      limit: 30,
      order: "desc",
      select: [
        "category",
        "title",
        "id",
        "category",
        "reviews",
        "images",
        "dimensions",
        "tags",
        "shippingInformation"
      ]
    });
  }

```

all of which are valid select options in the type def of the `@wallet-ledger/seed` package

now on hovewr -- and with a deeper look -- the RT shows:

```ts
(method) ItemsService<T extends keyof ProductDataFull = keyof ProductDataFull>.reusableFetching(): Promise<{
    products: {
        id: number;
        title: string;
        category: string;
        tags: string[];
        dimensions: {
            width: number;
            height: number;
            depth: number;
        };
        shippingInformation: string;
        reviews: {
            rating: number;
            comment: string;
            date: string;
            reviewerName: string;
            reviewerEmail: string;
        }[];
        images: string[];
    }[];
    total: number;
    skip: number;
    limit: number;
}>
```

dynamic type derivation with no ceremony, generic injection, props passing, etc. good to go wherever.

```ts
import { randomUUID } from "node:crypto";
import type {
  AllProductPaths,
  DataApiOpts,
  FullRes,
  ProductDataFull,
  SelectUnion
} from "@/types.ts";
import { Fs } from "@d0paminedriven/fs";
import type { CTR, Unenumerate } from "@wallet-ledger/types";

export class ItemSeeder<
  B extends keyof ProductDataFull = keyof ProductDataFull
> extends Fs {
  constructor() {
    super(process.cwd());
  }
  protected safeErrMsg(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    } else if (typeof err === "object" && err != null) {
      return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    } else if (typeof err === "string") {
      return err;
    } else if (typeof err === "number") {
      return err.toPrecision(5);
    } else if (typeof err === "boolean") {
      return `${err}`;
    } else return String(err);
  }
  public async nodeUUID<const C extends number = 20>(count = 20 as C) {
    if (count <= 0) {
      throw new Error("UUID Target count must be a postive number");
    }
    const agg = Array.of<string>();
    for (const _i of this.len(Math.round(count))) {
      agg.push(randomUUID());
    }
    // const toJSON = JSON.stringify(agg, null, 2);
    // const templatize = `export const aggItemUUIDs = ${toJSON};`;
    // this.withWs(`src/items/gen/ids.ts`, templatize);

    return agg;
  }

  private handleQp<
    const M extends string[] = string[],
    const U extends string = string
  >(s: M, url: U) {
    if (s.length > 0) {
      return url.concat(`?`).concat(s.join("&"));
    } else {
      return url;
    }
  }

  private handleSelect<
    const V extends keyof ProductDataFull = keyof ProductDataFull
  >({ limit, order, select, skip, sortBy }: DataApiOpts<V>) {
    const a = Array.of<readonly [string, string | number | boolean]>();

    if (select && select.length > 0) {
      const k = select.join(",");
      const tuple = ["select", k] as const;
      a.push(tuple);
    }
    if (skip && skip > 0) {
      a.push(["skip", 0]);
    }
    if (order) {
      a.push(["order", order]);
    }
    if (limit) {
      if (limit <= 0) {
        a.push(["limit", 1]);
      } else {
        a.push(["limit", limit]);
      }
    }
    if (sortBy) {
      a.push(["sortBy", sortBy]);
    }

    return { arr: a, selectFilter: select };
  }

  public async reusableFetch<const S extends keyof ProductDataFull>(
    path: AllProductPaths,
    qParams: CTR<DataApiOpts<S>, "select">
  ): Promise<FullRes<S>>;
  public async reusableFetch(
    path: AllProductPaths,
    qParams: DataApiOpts<keyof ProductDataFull>
  ): Promise<FullRes<keyof ProductDataFull>>;
  public async reusableFetch<
    const A extends AllProductPaths = AllProductPaths,
    const S extends keyof ProductDataFull = keyof ProductDataFull
  >(path: A, queryParams: DataApiOpts<S>) {
    const qParams = this.handleSelect(queryParams);

    console.log("debig", qParams);
    const s = qParams.selectFilter;
    const arr = Array.of<string>();
    if (qParams.arr && qParams.arr.length > 0) {
      for (const [_, v] of qParams.arr.entries()) {
        const format = [v[0], `${v[1]}`.trim()] as const;
        arr.push(format.join("="));
      }
    }
    const urlPrimed = this.handleQp(arr, `https://dummyjson.com/${path}`);
    console.log(urlPrimed);
    return await fetch(urlPrimed, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    }).then(async t => {
      if (s) {
        return await t.json<FullRes<Unenumerate<typeof s>>>();
      } else {
        return await t.json<FullRes<keyof ProductDataFull>>();
      }
    });
  }
  private IdMap = new Map<number, string>();
  private len<const R extends number = number>(r = 20 as R) {
    return Array.from({ length: r });
  }

  public validProductPath(s: string) {
    return (
      s === "products" ||
      s === "products/categories" ||
      s === "products/category/beauty" ||
      s === "products/category/fragrances" ||
      s === "products/category/furniture" ||
      s === "products/category/groceries" ||
      s === "products/category/home-decoration" ||
      s === "products/category/kitchen-accessories" ||
      s === "products/category/laptops" ||
      s === "products/category/mens-shirts" ||
      s === "products/category/mens-shoes" ||
      s === "products/category/mens-watches" ||
      s === "products/category/mobile-accessories" ||
      s === "products/category/motorcycle" ||
      s === "products/category/skin-care" ||
      s === "products/category/smartphones" ||
      s === "products/category/sports-accessories" ||
      s === "products/category/sports-accessories" ||
      s === "products/category/sunglasses" ||
      s === "products/category/tablets" ||
      s === "products/category/tops" ||
      s === "products/category/vehicle" ||
      s === "products/category/womens-bags" ||
      s === "products/category/womens-dresses" ||
      s === "products/category/womens-jewellery" ||
      s === "products/category/womens-shoes" ||
      s === "products/category/womens-watches" ||
      s === "products/category-list"
    );
  }
  public async genDummyData<
    const A extends AllProductPaths = AllProductPaths,
    const S extends SelectUnion = SelectUnion,
    const D extends DataApiOpts<S> = DataApiOpts<S>
  >(path: A, qPow: D) {
    const { limit: l, skip: s } = qPow;

    const wow = await this.reusableFetch(path, {
      ...qPow,
      limit: l ?? qPow?.limit ?? 20,
      skip: s ?? qPow.skip ?? 0,
      sortBy: "price",
      order: "desc",
      select: ["description", "title", "price", "id"] satisfies SelectUnion[]
    });

    const getUUIDs = await this.nodeUUID(qPow.limit ?? 20);
    const seederArr = Array.of<{
      id: string;
      name: string;
      description: string;
      price: number;
    }>();

    for (const [idNo, id] of Array.from(getUUIDs.entries())) {
      this.IdMap.set(idNo, id);
    }
    console.log(wow.products);
    for (const [pNo, pData] of Array.from(wow.products.entries())) {
      pData.title;
      pData.description;
      // title -> name
      // dollars -> cents
      // id Int -> UUID
      // only Item id (UUID), cost (cents), and name (title  needed for this endpoint
      const { title: name, description, id: _id, ...restP } = pData;
      const getId = this.IdMap.get(pNo);

      if (getId) {
        seederArr.push({
          id: getId,
          name,
          description,
          price: Math.round(restP.price * 100)
        });
      }
    }
    return seederArr;
  }

  public seeder = async <
    const P extends AllProductPaths,
    const T extends keyof ProductDataFull
  >(
    path = "products" as P,
    qPow: CTR<DataApiOpts<T>, "select">
  ) => {
    return await this.reusableFetch(path, qPow);
  };
}

```

```ts
import type { Rm } from "@wallet-ledger/types";

export type ProductPath = `products`;
export type ProductCats<T extends CategoryUnion | undefined = undefined> =
  T extends undefined
    ? `${ProductPath}/categories`
    : T extends CategoryUnion
      ? `${ProductPath}/category/${T}`
      : never;

export type AllProductPaths =
  | ProductCats<CategoryUnion>
  | "products/categories"
  | "products/category-list"
  | "products";

export type SortByUnion =
  | "title"
  | "price"
  | "rating"
  | "sku"
  | "discountPercentage"
  | "category"
  | "id"
  | "brand"
  | "stock"
  | "weight"
  | "availabilityStatus"
  | "minimumOrderQuantity";

export type SelectUnion =
  | SortByUnion
  | "thumbnail"
  | "images"
  | "returnPolicy"
  | "reviews"
  | "shippingInformation"
  | "warrantyInformation"
  | "tags"
  | "dimensions"
  | "description"
  | "meta";

export interface ExpandedSeeder<M extends boolean = boolean> {
  id: M extends false ? number : string;
  title: string;
  price: number;
  name: string;
  description?: string;
}

export interface DataApiOpts<T extends keyof ProductDataFull> {
  limit?: number;
  skip?: number;
  select?: readonly T[] | readonly [T];
  sortBy?: SortByUnion;
  order?: "asc" | "desc";
}

export type ItemSeederSingleton<
  M extends boolean = boolean,
  V extends "title" | "name" = "title"
> = V extends "name"
  ? Rm<ExpandedSeeder<M>, "title">
  : Rm<ExpandedSeeder<M>, "name">;
export interface ItemSeederProductsEntity<
  M extends boolean = boolean,
  V extends "title" | "name" = "title"
> {
  products: ItemSeederSingleton<M, V>[];
}

export interface ItemSeederEntity<
  M extends boolean = boolean,
  V extends "title" | "name" = "title"
> extends ItemSeederProductsEntity<M, V> {
  total: number;
  skip: number;
  limit: number;
}
export interface ProductMetaFields {
  createdAt: string;
  updatedAt: string;
  barcode: string;
  qrCode: string;
}

export interface ProductDims {
  width: number;
  height: number;
  depth: number;
}

export interface ProductReviewsSingleton {
  rating: number;
  comment: string;
  date: string;
  reviewerName: string;
  reviewerEmail: string;
}

export interface ProductDataFull {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  discountPercentage: number;
  rating: number;
  stock: number;
  tags: string[];
  sku: string;
  weight: number;
  dimensions: ProductDims;
  warrantyInformation: string;
  shippingInformation: string;
  availabilityStatus: string;
  reviews: ProductReviewsSingleton[];
  returnPolicy: string;
  minimumOrderQuantity: number;
  meta: ProductMetaFields;
  /**
   * always webp
   */
  images: string[];
  thumbnail: string;
  brand?: string | undefined;
}

export type FilterBySelect<Q extends keyof ProductDataFull> = Exclude<
  Exclude<Q, ProductDataFull>,
  ProductDataFull
>;

export type FilterResults<S extends keyof ProductDataFull> = Rm<
  ProductDataFull,
  Exclude<keyof ProductDataFull, FilterBySelect<S>>
>;

export interface FullRes<
  S extends keyof ProductDataFull = keyof ProductDataFull
> {
  products: FilterResults<S>[];
  total: number;
  skip: number;
  limit: number;
}
export type CategoryUnion =
  | "beauty"
  | "fragrances"
  | "furniture"
  | "groceries"
  | "home-decoration"
  | "kitchen-accessories"
  | "laptops"
  | "mens-shirts"
  | "mens-shoes"
  | "mens-watches"
  | "mobile-accessories"
  | "motorcycle"
  | "skin-care"
  | "smartphones"
  | "sports-accessories"
  | "sunglasses"
  | "tablets"
  | "tops"
  | "vehicle"
  | "womens-bags"
  | "womens-dresses"
  | "womens-jewellery"
  | "womens-shoes"
  | "womens-watches";
```
