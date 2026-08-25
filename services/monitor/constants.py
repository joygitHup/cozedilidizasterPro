"""Display maps and shared constants."""

DEVICE_TYPE = {
    "npr_anchor": "NPR锚索计",
    "rainfall": "雨量计",
    "fiber_optic": "光纤光栅",
    "camera": "摄像头",
    "gnss": "GNSS位移站",
    "inclinometer": "倾角仪",
    "others": "其他",
}

DEVICE_TYPE_VALUES = list(DEVICE_TYPE.keys())

STATUS = {
    "online": "在线",
    "offline": "离线",
    "fault": "故障",
}

SIGNAL = {
    "strong": "强",
    "medium": "中",
    "weak": "弱",
}

DATA_TYPE = {
    "force": "牛顿力",
    "displacement": "位移",
    "rainfall": "降雨量",
    "stress": "应力",
    "strain": "应变",
    "temperature": "温度",
}

DATA_TYPE_VALUES = list(DATA_TYPE.keys())

DEFAULT_UNITS = {
    "force": "kN",
    "displacement": "mm",
    "rainfall": "mm",
    "stress": "MPa",
    "strain": "με",
    "temperature": "℃",
}

DEVICE_DEFAULT_DATA_TYPE = {
    "npr_anchor": "force",
    "rainfall": "rainfall",
    "fiber_optic": "strain",
    "gnss": "displacement",
    "inclinometer": "displacement",
    "camera": "temperature",
    "others": "force",
}

PARAM_SCALE = {
    "force": 100,
    "rainfall": 100,
    "displacement": 50,
    "stress": 100,
    "strain": 800,
    "temperature": 50,
}

DEFAULT_THRESHOLDS = {
    "force": {"yellow": 50, "orange": 70, "red": 85, "change_rate_red": 30},
    "rainfall": {"yellow": 30, "orange": 50, "red": 80},
    "displacement": {"yellow": 5, "orange": 10, "red": 20},
    "stress": {"yellow": 40, "orange": 60, "red": 80},
    "strain": {"yellow": 200, "orange": 400, "red": 600},
    "temperature": {"yellow": 40, "orange": 50, "red": 60},
}

CODE_PREFIX = {
    "npr_anchor": "NPR",
    "rainfall": "RAIN",
    "fiber_optic": "FIB",
    "camera": "CAM",
    "gnss": "GNSS",
    "inclinometer": "INC",
    "others": "DEV",
}

UNLINKED_ALERT_KEY = "iot:alert:unlinked:{code}"
