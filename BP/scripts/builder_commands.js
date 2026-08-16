import { BlockPermutation, GameMode, system, world } from "@minecraft/server";

const EVENT_PREFIX = "customnpc:";
const MAX_BLOCKS = 5000000;
const MAX_RADIUS = 512;
const BLOCKS_PER_TICK = 4096;
const MAX_JOBS = 4;
const TICKING_AREA_HALF_SPAN = 10;
const TICKING_AREA_SLICE_SPAN = 10;
const TICKING_AREA_WAIT_TICKS = 8;
const WAND_ITEM_ID = "customnpc:wooden_wand";

const jobs = [];
const selections = new Map();
let runnerStarted = false;

function canUseBuilder(player) {
    try {
        return player.getGameMode() === GameMode.Creative;
    } catch {
        return false;
    }
}

function normalizeBlockId(value) {
    const id = String(value ?? "").trim().toLowerCase();
    if (!id) throw new Error("方块ID为空");
    return id.includes(":") ? id : `minecraft:${id}`;
}

function resolveBlock(value) {
    const blockId = normalizeBlockId(value);
    return { blockId, permutation: BlockPermutation.resolve(blockId) };
}

function parseCoord(value, base) {
    const text = String(value ?? "").trim();
    if (!text) throw new Error("坐标为空");
    if (text.startsWith("~")) {
        const offset = text.length === 1 ? 0 : Number(text.slice(1));
        if (!Number.isFinite(offset)) throw new Error(`坐标无效: ${text}`);
        return Math.floor(base + offset);
    }
    const number = Number(text);
    if (!Number.isFinite(number)) throw new Error(`坐标无效: ${text}`);
    return Math.floor(number);
}

function parseRadius(value) {
    const radius = Math.floor(Number(value));
    if (!Number.isInteger(radius) || radius < 1) throw new Error("半径必须是正整数");
    if (radius > MAX_RADIUS) throw new Error(`半径过大(>${MAX_RADIUS})`);
    return radius;
}

function tell(player, message) {
    try {
        if (player?.isValid) player.sendMessage(`[超大填充] ${message}`);
    } catch {
        // 玩家已离线
    }
}

function help(player) {
    tell(player, "/scriptevent customnpc:xfill x1 y1 z1 x2 y2 z2 方块ID");
    tell(player, "/scriptevent customnpc:xfill sel 方块ID  使用小木棍选区");
    tell(player, "/scriptevent customnpc:xplatform x y z 半径 方块ID");
    tell(player, "/scriptevent customnpc:xplatform here 198 stone");
    tell(player, "小木棍右键两个方块选区；远区块会自动临时加载；xstatus 查看；xcancel 取消。");
}

function formatPos(pos) {
    return `${pos.x} ${pos.y} ${pos.z}`;
}

function queueJob(player, job) {
    const owned = jobs.filter((item) => item.playerName === player.name).length;
    if (owned >= MAX_JOBS) throw new Error(`你的任务过多(>${MAX_JOBS})`);
    jobs.push(job);
    tell(player, `已加入队列: ${job.label}，约 ${job.total} 方块。`);
    if (!runnerStarted) {
        runnerStarted = true;
        system.runInterval(processJobs, 1);
    }
}

function makeFillJob(player, args) {
    if (args.length < 7) throw new Error("用法: !xfill x1 y1 z1 x2 y2 z2 方块ID");
    const location = player.location;
    const x1 = parseCoord(args[0], location.x);
    const y1 = parseCoord(args[1], location.y);
    const z1 = parseCoord(args[2], location.z);
    const x2 = parseCoord(args[3], location.x);
    const y2 = parseCoord(args[4], location.y);
    const z2 = parseCoord(args[5], location.z);
    const { blockId, permutation } = resolveBlock(args[6]);
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);
    const total = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
    if (total > MAX_BLOCKS) throw new Error(`范围过大(${total}>${MAX_BLOCKS})`);
    return {
        type: "fill",
        label: `${blockId} 矩形填充`,
        player,
        playerName: player.name,
        dimension: player.dimension,
        permutation,
        total,
        done: 0,
        placed: 0,
        skipped: 0,
        failed: 0,
        ticks: 0,
        areaName: `cnpc_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000)}`,
        areaNames: [],
        areaCenterChunkX: null,
        areaCenterChunkZ: null,
        areaWaitTicks: 0,
        areaChanges: 0,
        minX,
        maxX,
        minY,
        maxY,
        minZ,
        maxZ,
        x: minX,
        y: minY,
        z: minZ
    };
}

function makeSelectedFillJob(player, args) {
    if (args.length < 2) throw new Error("用法: /scriptevent customnpc:xfill sel 方块ID");
    const selection = selections.get(player.name);
    if (!selection?.pos1 || !selection?.pos2) throw new Error("请先用小木棍选取两个方块。");
    if (selection.dimensionId !== player.dimension.id) throw new Error("选区不在当前维度。");
    return makeFillJob(player, [
        String(selection.pos1.x),
        String(selection.pos1.y),
        String(selection.pos1.z),
        String(selection.pos2.x),
        String(selection.pos2.y),
        String(selection.pos2.z),
        args[1]
    ]);
}

function countCircleBlocks(radius) {
    const radiusSq = radius * radius;
    let total = 0;
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            if (dx * dx + dz * dz <= radiusSq) total++;
        }
    }
    return total;
}

function makePlatformJob(player, args) {
    const location = player.location;
    let cx;
    let cy;
    let cz;
    let radius;
    let blockArg;
    if (String(args[0] ?? "").toLowerCase() === "here") {
        if (args.length < 3) throw new Error("用法: !xplatform here 半径 方块ID");
        cx = Math.floor(location.x);
        cy = Math.floor(location.y) - 1;
        cz = Math.floor(location.z);
        radius = parseRadius(args[1]);
        blockArg = args[2];
    } else {
        if (args.length < 5) throw new Error("用法: !xplatform x y z 半径 方块ID");
        cx = parseCoord(args[0], location.x);
        cy = parseCoord(args[1], location.y);
        cz = parseCoord(args[2], location.z);
        radius = parseRadius(args[3]);
        blockArg = args[4];
    }
    const { blockId, permutation } = resolveBlock(blockArg);
    const total = countCircleBlocks(radius);
    if (total > MAX_BLOCKS) throw new Error(`范围过大(${total}>${MAX_BLOCKS})`);
    return {
        type: "platform",
        label: `${blockId} 圆形平台 r=${radius}`,
        player,
        playerName: player.name,
        dimension: player.dimension,
        permutation,
        total,
        done: 0,
        placed: 0,
        skipped: 0,
        failed: 0,
        ticks: 0,
        areaName: `cnpc_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000)}`,
        areaNames: [],
        areaCenterChunkX: null,
        areaCenterChunkZ: null,
        areaWaitTicks: 0,
        areaChanges: 0,
        cx,
        cy,
        cz,
        radius,
        radiusSq: radius * radius,
        dx: -radius,
        dz: -radius
    };
}

function place(job, x, y, z) {
    try {
        const block = job.dimension.getBlock({ x, y, z });
        if (!block) {
            job.skipped++;
            return;
        }
        block.setPermutation(job.permutation);
        job.placed++;
    } catch {
        job.failed++;
    }
}

function chunkCoord(value) {
    return Math.floor(value / 16);
}

function chunkBlockMin(chunk) {
    return chunk * 16;
}

function cleanupTickingArea(job) {
    if (!job.areaNames?.length) return;
    for (const areaName of job.areaNames) {
        try {
            job.dimension.runCommand(`tickingarea remove ${areaName}`);
        } catch {
            // 区域已移除
        }
    }
    job.areaNames = [];
    job.areaCenterChunkX = null;
    job.areaCenterChunkZ = null;
}

function addTickingWindow(job, minChunkX, maxChunkX, minChunkZ, maxChunkZ, y, suffix) {
    const areaName = `${job.areaName}_${suffix}`;
    const minX = chunkBlockMin(minChunkX);
    const maxX = chunkBlockMin(maxChunkX) + 15;
    const minZ = chunkBlockMin(minChunkZ);
    const maxZ = chunkBlockMin(maxChunkZ) + 15;
    job.dimension.runCommand(`tickingarea add ${minX} ${y} ${minZ} ${maxX} ${y} ${maxZ} ${areaName} true`);
    job.areaNames.push(areaName);
}

function nextFillLocation(job) {
    if (job.x > job.maxX) return null;
    return { x: job.x, y: job.y, z: job.z };
}

function nextPlatformLocation(job) {
    let dx = job.dx;
    let dz = job.dz;
    while (dx <= job.radius) {
        if (dx * dx + dz * dz <= job.radiusSq) {
            return { x: job.cx + dx, y: job.cy, z: job.cz + dz };
        }
        dz++;
        if (dz <= job.radius) continue;
        dz = -job.radius;
        dx++;
    }
    return null;
}

function currentTargetLocation(job) {
    return job.type === "platform" ? nextPlatformLocation(job) : nextFillLocation(job);
}

function ensureLoadedWindow(job) {
    if (job.areaWaitTicks > 0) {
        job.areaWaitTicks--;
        return false;
    }
    const target = currentTargetLocation(job);
    if (!target) return true;
    const centerChunkX = chunkCoord(target.x);
    const centerChunkZ = chunkCoord(target.z);
    if (job.areaCenterChunkX === centerChunkX && job.areaCenterChunkZ === centerChunkZ) return true;

    cleanupTickingArea(job);
    const minChunkX = centerChunkX - TICKING_AREA_HALF_SPAN;
    const maxChunkX = centerChunkX + TICKING_AREA_HALF_SPAN - 1;
    const minChunkZ = centerChunkZ - TICKING_AREA_HALF_SPAN;
    const maxChunkZ = centerChunkZ + TICKING_AREA_HALF_SPAN - 1;
    const midChunkX = minChunkX + TICKING_AREA_SLICE_SPAN - 1;
    const midChunkZ = minChunkZ + TICKING_AREA_SLICE_SPAN - 1;
    const y = target.y;
    try {
        addTickingWindow(job, minChunkX, midChunkX, minChunkZ, midChunkZ, y, "a");
        addTickingWindow(job, midChunkX + 1, maxChunkX, minChunkZ, midChunkZ, y, "b");
        addTickingWindow(job, minChunkX, midChunkX, midChunkZ + 1, maxChunkZ, y, "c");
        addTickingWindow(job, midChunkX + 1, maxChunkX, midChunkZ + 1, maxChunkZ, y, "d");
    } catch (error) {
        cleanupTickingArea(job);
        tell(job.player, `临时加载区块失败: ${String(error?.message ?? error)}`);
        job.failed += Math.max(0, job.total - job.done);
        job.done = job.total;
        return true;
    }
    job.areaCenterChunkX = centerChunkX;
    job.areaCenterChunkZ = centerChunkZ;
    job.areaWaitTicks = TICKING_AREA_WAIT_TICKS;
    job.areaChanges++;
    if (job.areaChanges === 1 || job.areaChanges % 10 === 0) {
        tell(job.player, `加载区块窗口 ${job.areaChanges}: chunk ${centerChunkX}, ${centerChunkZ}，约20x20区块`);
    }
    return false;
}

function advanceFill(job) {
    job.done++;
    job.z++;
    if (job.z <= job.maxZ) return;
    job.z = job.minZ;
    job.y++;
    if (job.y <= job.maxY) return;
    job.y = job.minY;
    job.x++;
}

function stepFill(job) {
    if (job.x > job.maxX) return false;
    place(job, job.x, job.y, job.z);
    advanceFill(job);
    return true;
}

function advancePlatform(job) {
    job.dz++;
    if (job.dz <= job.radius) return;
    job.dz = -job.radius;
    job.dx++;
}

function stepPlatform(job) {
    while (job.dx <= job.radius) {
        const dx = job.dx;
        const dz = job.dz;
        advancePlatform(job);
        if (dx * dx + dz * dz > job.radiusSq) continue;
        place(job, job.cx + dx, job.cy, job.cz + dz);
        job.done++;
        return true;
    }
    return false;
}

function processJobs() {
    const job = jobs[0];
    if (!job) return;
    job.ticks++;
    if (!ensureLoadedWindow(job)) return;
    let count = 0;
    while (count < BLOCKS_PER_TICK) {
        const worked = job.type === "platform" ? stepPlatform(job) : stepFill(job);
        if (!worked) break;
        count++;
    }
    if (job.done >= job.total) {
        jobs.shift();
        cleanupTickingArea(job);
        tell(job.player, `完成: 放置 ${job.placed}，跳过 ${job.skipped}，失败 ${job.failed}。`);
        return;
    }
    if (job.ticks % 40 === 0) {
        const percent = Math.floor((job.done / job.total) * 100);
        tell(job.player, `${job.label}: ${percent}% (${job.done}/${job.total})`);
    }
}

function cancelJobs(player) {
    let removed = 0;
    for (let index = jobs.length - 1; index >= 0; index--) {
        if (jobs[index].playerName === player.name) {
            cleanupTickingArea(jobs[index]);
            jobs.splice(index, 1);
            removed++;
        }
    }
    tell(player, removed ? `已取消 ${removed} 个任务。` : "没有可取消的任务。");
}

function status(player) {
    const selection = selections.get(player.name);
    if (selection?.pos1 || selection?.pos2) {
        tell(player, `选区: A=${selection.pos1 ? formatPos(selection.pos1) : "未选"}; B=${selection.pos2 ? formatPos(selection.pos2) : "未选"}`);
    }
    if (!jobs.length) {
        tell(player, "当前没有填充任务。");
        return;
    }
    jobs.slice(0, 5).forEach((job, index) => {
        const percent = Math.floor((job.done / job.total) * 100);
        tell(player, `${index + 1}. ${job.playerName}: ${job.label} ${percent}%`);
    });
}

function runBuilderCommand(player, name, args) {
    if (!canUseBuilder(player)) {
        tell(player, "仅创造模式可用。");
        return;
    }
    try {
        if (name === "xhelp" || (name === "xfill" && args[0]?.toLowerCase() === "help")) return help(player);
        if (name === "xstatus") return status(player);
        if (name === "xcancel") return cancelJobs(player);
        if (name === "xfill") {
            if (args[0]?.toLowerCase() === "sel") return queueJob(player, makeSelectedFillJob(player, args));
            return queueJob(player, makeFillJob(player, args));
        }
        if (name === "xplatform") return queueJob(player, makePlatformJob(player, args));
        help(player);
    } catch (error) {
        tell(player, String(error?.message ?? error));
    }
}

function rememberSelection(player, location, point) {
    const current = selections.get(player.name);
    const sameDimension = current?.dimensionId === player.dimension.id;
    const next = sameDimension ? { ...current } : { dimensionId: player.dimension.id, pos1: null, pos2: null };
    const pos = { x: location.x, y: location.y, z: location.z };
    if (point === 1) {
        next.pos1 = pos;
        selections.set(player.name, next);
        tell(player, `已选取第 1 点: ${formatPos(pos)}`);
        return;
    }
    next.pos2 = pos;
    selections.set(player.name, next);
    tell(player, `已选取第 2 点: ${formatPos(pos)}。使用 /scriptevent customnpc:xfill sel 方块ID`);
}

function setupSelectionWand() {
    world.beforeEvents.playerBreakBlock.subscribe((event) => {
        if (event.itemStack?.typeId !== WAND_ITEM_ID) return;
        event.cancel = true;
        const location = event.block.location;
        const player = event.player;
        system.run(() => rememberSelection(player, location, 1));
    });
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        if (!event.isFirstEvent) return;
        if (event.itemStack?.typeId !== WAND_ITEM_ID) return;
        event.cancel = true;
        const location = event.block.location;
        const player = event.player;
        system.run(() => rememberSelection(player, location, 2));
    });
}

export function setupBuilderCommands() {
    setupSelectionWand();
    system.afterEvents.scriptEventReceive.subscribe((event) => {
        const id = String(event.id ?? "").toLowerCase();
        if (!id.startsWith(EVENT_PREFIX)) return;
        const name = id.slice(EVENT_PREFIX.length);
        if (!name.startsWith("x")) return;
        const player = event.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return;
        const args = String(event.message ?? "").trim().split(/\s+/).filter(Boolean);
        system.run(() => runBuilderCommand(/** @type {any} */ (player), name, args));
    });
}
