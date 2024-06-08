import { defineCreamDB } from "./index";
import { expect, test } from "vitest";

test("get", async () => {
    const mockStorage = new Map<string, string>();
    const db = await defineCreamDB<{ foo: { name: string } }>({
        storage: {
            getItem: (key: string) => mockStorage.get(key) ?? null,
            setItem: (key: string, value: string) => void mockStorage.set(key, value),
        }
    });

    const value1 = db.foo.get("key1");
    expect(value1).toBe(undefined);

    db.foo.set("key2", { name: "value2" });
    const value2 = db.foo.get("key2")!;
    expect(value2.name).toBe("value2");
});

test("persistence", async () => {
    const mockStorage = new Map<string, string>();
    const db1 = await defineCreamDB<{ foo: { name: string } }>({
        storage: {
            getItem: (key: string) => mockStorage.get(key) ?? null,
            setItem: (key: string, value: string) => void mockStorage.set(key, value),
        }
    });
    db1.foo.set("key1", { name: "value1" });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const db2 = await defineCreamDB<{ foo: { name: string } }>({
        storage: {
            getItem: (key: string) => mockStorage.get(key) ?? null,
            setItem: (key: string, value: string) => void mockStorage.set(key, value),
        }
    });
    const value2 = db2.foo.get("key1")!;
    expect(value2.name).toBe("value1");
});