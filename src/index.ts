import { TSON } from "@southern-aurora/tson";

export type CreamDBTable = Record<string, unknown>;

export type CreamDBConfig = {
    name?: string;
    // seeds?: () => Promise<Record<string, CreamDBTable>> | Record<string, CreamDBTable>;
    persistence?: {
        delay?: number;
    }
    storage?: {
        getItem: (key: string) => string | null | Promise<string | null>;
        setItem: (key: string, value: string) => void | Promise<void>;
    }
}

export type Creamap<T = any> = {
    toArray: () => Array<T>;
    toJSON: () => Record<string, T>;
    get: (key: string) => T | undefined;
    has: (key: string) => boolean;
    del: (key: string) => void;
    getLength: () => number;
    getKeys: () => IterableIterator<string>;
    getValues: () => IterableIterator<T>;
    set: (key: string, value: T) => void;
    forEach: (handler: (value: T, key: string) => void) => void;
    sortBy: (compareFn: (a: any, b: any) => number) => Creamap<T>;
    paginate: (currentPpage: number, num: number, compareFn?: (a: any, b: any) => number) => Creamap<T>;
    filter: (handler: (value: T, key: string) => boolean) => Creamap<T>;
    find: (handler: (value: T, key: string) => boolean) => T | undefined;
    /**
     * Like Array "at" function, return key.
     */
    atKey: (index: number) => string | undefined;
    /**
     * Like Array "at" function, return value.
     */
    at: (index: number) => T | undefined;
} & {
    [Symbol.iterator](): IterableIterator<T>;
};

export type CreamDBExpand<CreamDBTableT extends CreamDBTable> = {
    watch: (tables: keyof CreamDBTableT | "*" | Array<keyof CreamDBTableT>, handler: () => void | Promise<void>) => Promise<() => void>;
    watchKey: (table: keyof CreamDBTableT, key: string, handler: () => void | Promise<void>) => Promise<() => void>;
}

export const defineCreamDB = async <CreamDBTableT extends CreamDBTable>(config: CreamDBConfig): Promise<Record<keyof CreamDBTableT, Creamap<CreamDBTableT[keyof CreamDBTableT]>> & CreamDBExpand<CreamDBTableT>> => {
    const database = new Map<string, Creamap>();
    if (config.storage) {
        const jsonRaw = await config.storage.getItem(config.name ?? "creamdb");

        if (jsonRaw) {
            const json = TSON.parse(jsonRaw);
            for (const tableName in json) {
                const table = json[tableName]
                database.set(tableName, createCreamap(tableName, new Map(Object.entries(table))));
            }
        }
    }

    const database2JSON = () => {
        const json: Record<string, unknown> = {};
        for (const [tableName, table] of database) {

            json[tableName] = table.toJSON();
        }
        return json;
    }

    const toArray = (table: string, target: Map<string, unknown>) => {
        return [...target.values()];
    };

    const toJSON = (table: string, target: Map<string, unknown>) => {
        return Object.fromEntries(target);
    };

    const getLength = (table: string, target: Map<string, unknown>) => {
        return target.size;
    };

    const getKeys = (table: string, target: Map<string, unknown>) => {
        return target.keys();
    };

    const getValues = (table: string, target: Map<string, unknown>) => {
        return target.values();
    };

    const forEach = (table: string, target: Map<string, unknown>, handler: (value: unknown, key: string) => void) => {
        for (let [k, v] of target.entries()) {
            handler(v, k);
        }
    };

    const sortBy = (table: string, target: Map<string, unknown>, compareFn: (a: any, b: any) => number) => {
        const arr = Array.from(target);
        arr.sort((a, b) => compareFn(a[1], b[1]));
        return createCreamap(table, new Map(arr.map((i) => [i[0], i[1]])));
    };

    const paginate = (table: string, target: Map<string, unknown>, currentPage: number, num: number, compareFn?: (a: any, b: any) => number) => {
        const res = createCreamap(table);

        let data: Map<string, unknown>;
        if (undefined === compareFn) data = target;
        else data = sortBy(table, target, compareFn).toJSON();

        if (currentPage < 1) currentPage = 1;

        const min = (currentPage - 1) * num;
        const max = min + num;

        let i = 0;
        for (const [key, value] of data) {
            i++;
            if (i <= min) continue;
            if (i > max) break;
            res[key] = value;
        }

        return res;
    };

    const filter = (table: string, target: Map<string, unknown>, handler: (value: any, key: string) => boolean) => {
        const newMap = createCreamap(table);
        for (let [k, v] of target.entries()) {
            if (true === handler(v, k)) {
                newMap[k] = v;
            }
        }
        return newMap;
    };

    const find = (table: string, target: Map<string, unknown>, handler: (value: any, key: string) => boolean) => {
        for (let [k, v] of target.entries()) {
            if (true === handler(v, k)) {
                return v;
            }
        }
        return undefined;
    };

    const atKey = (table: string, target: Map<string, unknown>, index: number) => {
        if (index < 0) index = target.size - Math.abs(index);

        let i = 0;
        for (const [key] of target) {
            if (i === index) return key;
            i++;
        }

        return undefined;
    };

    const at = (table: string, target: Map<string, unknown>, index: number) => {
        if (index < 0) index = target.size - Math.abs(index);

        let i = 0;
        for (const [_key, value] of target) {
            if (i === index) return value;
            i++;
        }

        return undefined;
    };

    const get = (table: string, target: Map<string, unknown>, key: string): unknown => {
        let value = target.get(key);
        if (value !== undefined) return target.get(key);
        return undefined;
    };

    const has = (table: string, target: Map<string, unknown>, key: string): boolean => {
        return target.has(key);
    };

    let counter = 0;
    const tableWatcher = new Map<string, Function>();
    const keyWatcher = new Map<string, Function>();

    const dataPersistence = debounce(async () => {
        if (!config.storage) return;
        config.storage.setItem(config.name ?? "creamdb", TSON.stringify(database2JSON()));
    }, config?.persistence?.delay ?? 256);

    const set = (table: string, target: Map<string, unknown>, key: string, value: unknown): void => {
        target.set(key, value);
        for (const [k, handler] of tableWatcher) {
            if (!k.startsWith("*:") && !k.startsWith(`${table}:`)) continue;
            void handler(table, k);
        }
        for (const [k, handler] of keyWatcher) {
            if (!k.startsWith(`${table}:${key}:`)) continue;
            void handler(table, k);
        }
        void dataPersistence();
    };

    const del = (table: string, target: Map<string, unknown>, key: string): true => {
        target.delete(key);
        for (const [k, handler] of tableWatcher) {
            if (!k.startsWith("*:") && !k.startsWith(`${table}:`)) continue;
            void handler(table, k);
        }
        for (const [k, handler] of keyWatcher) {
            if (!k.startsWith(`${table}:${key}:`)) continue;
            void handler(table, k);
        }
        void dataPersistence();
        return true;
    };

    function createCreamap<ValueType = any>(table: string, map?: Map<string, unknown>): any {
        if (undefined === map) map = new Map<string, unknown>();
        return new Proxy(map, {
            get: (target, key: string) => {
                if (!key) return undefined;
                else if ("get" === key) {
                    return (key: string) => get(table, target, key);
                } else if ("set" === key) {
                    return (key: string, value: unknown) => set(table, target, key, value);
                } else if ("del" === key) {
                    return (key: string) => del(table, target, key);
                } else if ("toArray" === key) {
                    return () => toArray(table, target);
                } else if ("toJSON" === key) {
                    return () => toJSON(table, target);
                } else if ("getLength" === key) {
                    return () => getLength(table, target);
                } else if ("getKeys" === key) {
                    return () => getKeys(table, target);
                } else if ("getValues" === key) {
                    return () => getValues(table, target);
                } else if ("forEach" === key) {
                    return (handler: (value: unknown, key: string) => void) => forEach(table, target, handler);
                } else if ("filter" === key) {
                    return (handler: (value: unknown, key: string) => boolean) => filter(table, target, handler);
                } else if ("find" === key) {
                    return (handler: (value: unknown, key: string) => boolean) => find(table, target, handler);
                } else if ("sortBy" === key) {
                    return (compareFn: (a: unknown, b: unknown) => number) => sortBy(table, target, compareFn);
                } else if ("paginate" === key) {
                    return (currentPpage: number, num: number, compareFn: (a: unknown, b: unknown) => number) =>
                        paginate(table, target, currentPpage, num, compareFn);
                } else if ("atKey" === key) {
                    return (index: number) => atKey(table, target, index);
                } else if ("at" === key) {
                    return (index: number) => at(table, target, index);
                } else if ("has" === key) {
                    return (key: string) => has(table, target, key);
                } else if ("del" === key) {
                    return (key: string) => del(table, target, key);
                } else return undefined;
            },
            has: (target, key: string) => has(table, target, key),
            deleteProperty: (target, key: string) => del(table, target, key),
            ownKeys: (target) => [...target.keys()],
            getOwnPropertyDescriptor: (target, key: string) => ({
                enumerable: true,
                configurable: true,
                value: target.get(key),
            }),
        }) as unknown as Creamap<ValueType>;
    }

    const creamap = new Proxy({}, {
        get: (_target, key: string) => {
            if ("watch" === key) {
                return async (tables: string | Array<string>, handler: Function) => {
                    if (typeof tables === 'string') tables = [tables];
                    let tableWatcherKeys = [];
                    for (const table of tables) {
                        const key = `${table}:${++counter}`;
                        tableWatcherKeys.push(key);
                        tableWatcher.set(key, handler);
                    }
                    await handler();
                    return () => {
                        for (const key of tableWatcherKeys) tableWatcher.delete(key);
                    }
                }
            } if ("watchKey" === key) {
                return async (table: string, tableKey: string, handler: Function) => {
                    const key = `${table}:${tableKey}:${++counter}`;
                    keyWatcher.set(key, handler);
                    await handler();
                    return () => keyWatcher.delete(key) && undefined;
                }
            } else {
                let creamap = database.get(key);
                if (!creamap) {
                    creamap = createCreamap(key);
                    database.set(key, creamap!);
                }
                return creamap;
            }
        }
    }) as any;

    // if (config.seeds) {
    //     if (!config.storage || (await config.storage.getItem(`${config.name ?? "creamdb"}`)) !== "true") {
    //         if (config.storage) await config.storage.setItem(`${config.name ?? "creamdb"}`, "true");
    //         const result = await config.seeds();
    //         for (const tableName in result) {
    //             const tableData = result[tableName];
    //             for (const key in tableData) {
    //                 creamap[tableName].set(key, tableData[key]);
    //             }
    //         }
    //     }
    // }

    return creamap;
}

function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
): (...args: Parameters<T>) => ReturnType<T> | undefined {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return ((...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            func(...args);
            timeoutId = null;
        }, wait);
    }) as any;
}
