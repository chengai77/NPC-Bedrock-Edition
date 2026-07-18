// 皮肤注册表
// 0=粗臂 1=细臂

export const SKIN_COUNT = 100;

export const SKINS = Object.freeze({
    1: { armModel: 1, fixedName: "作者", nameLocked: true },
    2: { armModel: 1, fixedName: "星野", nameLocked: false },
    3: { armModel: 0 },
    4: { armModel: 0 },
    5: { armModel: 0 },
    6: { armModel: 0 },
    7: { armModel: 0 },
    8: { armModel: 0 },
    9: { armModel: 0 },
    10: { armModel: 0 },
    11: { armModel: 0 },
    12: { armModel: 0 },
    13: { armModel: 0 },
    14: { armModel: 0 },
    15: { armModel: 0 },
    16: { armModel: 0 },
    17: { armModel: 0 },
    18: { armModel: 0 },
    19: { armModel: 0 },
    20: { armModel: 0 },
    21: { armModel: 0 },
    22: { armModel: 0 },
    23: { armModel: 0 },
    24: { armModel: 0 },
    25: { armModel: 0 },
    26: { armModel: 0 },
    27: { armModel: 0 },
    28: { armModel: 0 },
    29: { armModel: 0 },
    30: { armModel: 0 },
    31: { armModel: 0 },
    32: { armModel: 0 },
    33: { armModel: 0 },
    34: { armModel: 0 },
    35: { armModel: 0 },
    36: { armModel: 0 },
    37: { armModel: 0 },
    38: { armModel: 0 },
    39: { armModel: 0 },
    40: { armModel: 0 },
    41: { armModel: 0 },
    42: { armModel: 0 },
    43: { armModel: 0 },
    44: { armModel: 0 },
    45: { armModel: 0 },
    46: { armModel: 0 },
    47: { armModel: 0 },
    48: { armModel: 0 },
    49: { armModel: 0 },
    50: { armModel: 0 },
    51: { armModel: 0 },
    52: { armModel: 0 },
    53: { armModel: 0 },
    54: { armModel: 0 },
    55: { armModel: 0 },
    56: { armModel: 0 },
    57: { armModel: 0 },
    58: { armModel: 0 },
    59: { armModel: 0 },
    60: { armModel: 0 },
    61: { armModel: 0 },
    62: { armModel: 0 },
    63: { armModel: 0 },
    64: { armModel: 0 },
    65: { armModel: 0 },
    66: { armModel: 0 },
    67: { armModel: 0 },
    68: { armModel: 0 },
    69: { armModel: 0 },
    70: { armModel: 0 },
    71: { armModel: 0 },
    72: { armModel: 0 },
    73: { armModel: 0 },
    74: { armModel: 0 },
    75: { armModel: 0 },
    76: { armModel: 0 },
    77: { armModel: 0 },
    78: { armModel: 0 },
    79: { armModel: 0 },
    80: { armModel: 0 },
    81: { armModel: 0 },
    82: { armModel: 0 },
    83: { armModel: 0 },
    84: { armModel: 0 },
    85: { armModel: 0 },
    86: { armModel: 0 },
    87: { armModel: 0 },
    88: { armModel: 0 },
    89: { armModel: 0 },
    90: { armModel: 0 },
    91: { armModel: 0 },
    92: { armModel: 0 },
    93: { armModel: 0 },
    94: { armModel: 0 },
    95: { armModel: 0 },
    96: { armModel: 0 },
    97: { armModel: 0 },
    98: { armModel: 0 },
    99: { armModel: 0 },
    100: { armModel: 0 }
});

export function getSkinInfo(skinId) {
    return SKINS[skinId] ?? { armModel: 0 };
}

export function getArmModel(skinId) {
    return getSkinInfo(skinId).armModel ?? 0;
}

export function isNameLocked(skinId) {
    return getSkinInfo(skinId).nameLocked === true;
}

export function getFixedName(skinId) {
    return getSkinInfo(skinId).fixedName ?? null;
}

export function getSkinDisplayName(skinId) {
    const fixed = getFixedName(skinId);
    return fixed ?? `皮肤 ${skinId}`;
}
