"""Champion baseline: strategy that won UET TEST 100 v2. Future results are not guaranteed."""
# UET synthetic opponent 4: Raider 01
PROFILE = {"variant":1,"race":8,"tempo":5,"capture":102,"danger":27,"defense":85,"flank":0,"noise":3,"repeat":4}

"""Parameterized legal strategy used to build the synthetic test population."""
def choose_move(state):
    options = state["legal_moves"]
    if not options:
        return None
    profile = PROFILE
    player, board = state["player"], state["board"]
    gx, gy = (8, 0) if player == "P1" else (0, 8)
    hx, hy = 8 - gx, 8 - gy
    beats = {"ROCK": "SCISSORS", "PAPER": "ROCK", "SCISSORS": "PAPER"}
    predator = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}
    recent = [m["to"] for m in state.get("history", [])[-8:] if m.get("player") == player]

    def score(move):
        ax, ay = ord(move["from"][0]) - 65, int(move["from"][1:]) - 1
        x, y = ord(move["to"][0]) - 65, int(move["to"][1:]) - 1
        if (x, y) == (gx, gy):
            return 10000000
        piece, target = board[ay][ax], board[y][x]
        danger = any(board[yy][xx] and board[yy][xx]["player"] != player
                     and board[yy][xx]["type"] == predator[piece["type"]]
                     for yy in range(max(0,y-1),min(9,y+2))
                     for xx in range(max(0,x-1),min(9,x+2))
                     if (xx,yy) != (x,y))
        home = piece if (x,y)==(hx,hy) else None if (ax,ay)==(hx,hy) else board[hy][hx]
        losing = any(board[yy][xx] and board[yy][xx]["player"] != player
                     and (xx,yy)!=(x,y) and (not home or beats[board[yy][xx]["type"]]==home["type"])
                     for yy in range(max(0,hy-1),min(9,hy+2))
                     for xx in range(max(0,hx-1),min(9,hx+2))
                     if (xx,yy)!=(hx,hy))
        distance = max(abs(x-gx),abs(y-gy))
        progress = max(abs(ax-gx),abs(ay-gy))-distance
        defense = target and max(abs(x-hx),abs(y-hy))<=2
        noise = ((x*19+y*31+ax*7+ay*13+profile["variant"]*23+state.get("turn",0)*3)%101)/100
        return (-distance*profile["race"] + progress*profile["tempo"]
                + bool(target)*profile["capture"] - danger*profile["danger"]
                + bool(defense)*profile["defense"] - losing*100000
                - (abs(x-gx)+abs(y-gy))*0.7 + abs(x-y)*profile["flank"]
                + noise*profile["noise"] - recent.count(move["to"])*profile["repeat"])
    move = max(options,key=score)
    return {"from":move["from"],"to":move["to"]}
