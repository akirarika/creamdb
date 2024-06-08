# CreamDB

CreamDB 是一个轻量级的客户端 "数据库"，可以运行在任何能够运行 JavaScript 的地方。

它是为包括 Electron、VS Code Extension、React Native、Capacitor、Taro、MiniProgram 等环境而设计的。这些环境，使我们可以使用 JavaScript/TypeScript 开发适用于桌面或移动设备的应用程序。

CreamDB 可以帮助你轻易地在客户端存储数据，并且，你可以订阅这些数据的更改。

## 注意事项

不建议在普通的浏览器网页中使用 CreamDB。因为如果用户打开了多个网页，那么不同网页间的 CreamDB 数据将互相覆盖。这种情况下，[RxDB](https://rxdb.info/) 是一个更好的选择。

如果你想制作一个 Electron 应用，请确保 CreamDB 运行在主进程而非渲染进程中，且只允许同时启动一个 Electron 进程。你可以使用 [Milkio](https://milkio.fun/) 来开发你的 Electron 应用，它解决了主进程和渲染进程之间的通信很麻烦的事情，并且在默认情况下，限制了你只能同时运行一个 Electron 进程。

## 使用

我们需要向 CreamDB 传递一个 `storage` 对象，来决定如何持久化你的数据，因为不同的平台下方式都不同。你可以安装一个适用于你平台的 `localStorage` 的 Polyfill，并传递给 Milkio：

```ts
import { defineCreamDB } from "creamdb";

type Tables = {
    foo: { name: string }
}
const db = await defineCreamDB<Tables>({
    storage: localStorage
});
```

或者，你也可以自己编写一个，例如对于 Node.js 或者 Bun 来说，这些很适合：

```ts
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { defineCreamDB } from "creamdb";

type Tables = {
    foo: { name: string }
}
const db = await defineCreamDB<Tables>({
    storage: {
        getItem: async (key: string) => {
            if (existsSync(`./data/${key}.json`)) return (await readFile(`./data/${key}.json`)).toString();
            return null;
        },
        setItem: async (key: string, value: string) => {
            await writeFile(`./data/${key}.json`, value);
        },
    }
});
```

## 入门

假设，我们需要记录用户最近看过的文章，我们可以添加一张 `history` 表，并设置这张表中的数据的格式。

```ts
type Tables = {
    history: { title: string, url: string, readAt: number }
}
const db = await defineCreamDB<Tables>({ ... });
```

现在，添加一条历史记录：

```ts
const title = "Milkio";
const url = "https://milkio.fun";
const readAt = new Date().getTime();
db.history.set(url, { title, url, readAt });
```

我们可以把每张表都理解成一个对象，拥有键和值。相同的键会相互覆盖。像上面我们使用 `url` 作为键，如果用户再次访问了相同的页面，则历史记录中不会重复出现两次。

现在，我们也可以轻松地读取它：

```ts
console.log(db.history.get(url)); // { title: "Milkio", url: "https://milkio.fun", readAt: 1680000000000 }
```

## 渲染

我们需要在历史记录页面，显示所有的记录。我们的表拥有迭代器，因此，我们可以在视图中轻松地遍历它，以 Vue 为例：

```vue
<template>
  <div v-for="item in db.history" :key="item.url">
    {{ item.name }}
  </div>
</template>
```

注意，CreamDB 毕竟是运行在前端中的 "数据库"，如果用户有非常多的历史记录，那么就会造成渲染太多的 DOM，这会导致性能问题。

## 订阅

CreamDB 允许你订阅表中的数据，当数据发生更改时，自动执行闭包方法。如果你需要当用户产生新的历史记录时，实时更新历史记录页面显示的内容时，这会很有用。

注意，你的闭包方法会在订阅时就自动执行一次，这可以方便你为你的响应式变量赋值。下面是 Vue 的示例：

```ts
const history = reactive([]);
await db.watch("history", () => {
    history = db.history.toArray();
});
```

你也可以订阅全部的表的更改：

```ts
const history = reactive([]);
await db.watch("*", () => {
    history = db.history.toArray();
});
```

想要退订，可以这样：

```ts
const history = reactive([]);
const unwatch = await db.watch("*", () => {
    history = db.history.toArray();
});

unwatch(); // 不再订阅
```

## 订阅指定键

如果你不想订阅整张表的更改，而是只想订阅某个键的更改，你可以改用 `watchKey` 方法。

```ts
await db.watchKey("history", "https://milkio.fun", () => {
    history = db.history.toArray();
});
```

## API

CreamDB 的每张表都有许多实用方法，帮助你更好的处理数据。

### del

删除表中的指定的键。

```ts
del: (key: string) => void;
```

### has

判断表中指定的键是否存在。

```ts
has: (key: string) => boolean;
```

### toArray

将表中的数据转为数组形式

```ts
toArray: () => Array<T>;
```

### toJSON

将表中的数据转为 JSON 形式

```ts
toJSON: () => Record<string, T>;
```

### getLength

获取当前表中存储了多少条数据

```ts
getLength: () => number;
```

### getKeys

获取表中所有的键（迭代器）

```ts
getKeys: () => IterableIterator<string>;
```

### getValues

获取表中所有的值（迭代器）

```ts
getValues: () => IterableIterator<T>;
```

### forEach

循环遍历表

```ts
forEach: (handler: (value: T, key: string) => void) => void;
```

### sortBy

对表进行排序（不会更改真实表中的数据，返回值将是一张新的表）。

```ts
sortBy: (compareFn: (a: any, b: any) => number) => Creamap<T>;
```

### paginate

以分页的形式读取表中的数据。

```ts
paginate: (currentPpage: number, num: number, compareFn?: (a: any, b: any) => number) => Creamap<T>;
```

### filter

筛选获取表中的数据。

```ts
filter: (handler: (value: T, key: string) => boolean) => Creamap<T>;
```

### find

查找表中的数据。

```ts
find: (handler: (value: T, key: string) => boolean) => T | undefined;
```

### at

获取表中第 N 条的数据，N 可以为负数，如果为负数，则从后往前获取。

```ts
at: (n: number) => string | undefined;
```

### atKey

获取表中第 N 条的数据的键，N 可以为负数，如果为负数，则从后往前获取。

```ts
atKey: (n: number) => string | undefined;
```