"""Sprinter: race to the goal, taking useful captures along the way."""


def choose_move(state):
    if not state["legal_moves"]:
        return None
    gx, gy = (8, 0) if state["player"] == "P1" else (0, 8)

    def score(move):
        x, y = ord(move["to"][0]) - 65, int(move["to"][1:]) - 1
        if (x, y) == (gx, gy):
            return 10000
        distance = max(abs(x - gx), abs(y - gy))
        return -20 * distance - abs(x - gx) - abs(y - gy) + (8 if state["board"][y][x] else 0)

    best = max(state["legal_moves"], key=score)
    return {"from": best["from"], "to": best["to"]}
