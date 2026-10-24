"""Guardian: advance safely and capture enemy runners near their goal."""


def choose_move(state):
    if not state["legal_moves"]:
        return None
    player, board = state["player"], state["board"]
    gx, gy = (8, 0) if player == "P1" else (0, 8)
    ex, ey = 8 - gx, 8 - gy
    predator = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}

    def score(move):
        x, y = ord(move["to"][0]) - 65, int(move["to"][1:]) - 1
        a, b = ord(move["from"][0]) - 65, int(move["from"][1:]) - 1
        if (x, y) == (gx, gy):
            return 10000
        target = board[y][x]
        danger = predator[board[b][a]["type"]]
        unsafe = any(board[yy][xx] and board[yy][xx]["player"] != player
                     and board[yy][xx]["type"] == danger
                     for yy in range(max(0, y - 1), min(9, y + 2))
                     for xx in range(max(0, x - 1), min(9, x + 2))
                     if (xx, yy) != (x, y))
        distance = max(abs(x - gx), abs(y - gy))
        defense = 150 if target and max(abs(x - ex), abs(y - ey)) <= 1 else 0
        return -20 * distance - abs(x - gx) - abs(y - gy) + (30 if target else 0) - (65 if unsafe else 0) + defense

    best = max(state["legal_moves"], key=score)
    return {"from": best["from"], "to": best["to"]}
