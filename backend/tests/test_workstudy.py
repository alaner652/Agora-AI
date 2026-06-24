"""工讀考勤：解析 + 排班純函式測試。"""

from actions.workstudy.index import (
    _build_payload,
    _build_svalue,
    free_slots_from_schedule,
    plan_shifts,
)
from parsers.workstudy import parse_workstudy_edit, parse_workstudy_master

MASTER_HTML = """
<form id="thisform">
<select id="select_year"><option value="" selected>請選擇年份</option>
  <option value="115">115</option></select>
<select id="select_moon"><option value="" selected>請選擇月份</option>
  <option value="6">6</option><option value="7">7</option></select>
<select id="chiose_unit">
  <option value="A009§AA">圖資處校資組(財經)—清寒學習服務生(A)</option>
  <option value="all§all" selected>全部單位</option></select>
<table><tr>
  <td>1</td><td>115</td><td>6</td><td>圖資處校資組(財經)</td><td>吳宸麒</td>
  <td>51231125</td><td>清寒學習服務生(A)</td><td>9.0</td><td>0</td><td>4000</td>
  <td>4,000元</td><td>未送件</td><td>&nbsp;</td>
  <td><input type="button" value="登錄" onclick="next('A009','AA')"></td>
</tr></table>
<input type="hidden" id="year" name="year" value="114">
<input type="hidden" id="sms" name="sms" value="2">
</form>
"""

EDIT_HTML = """
<form>
<input type="hidden" id="unit_id" name="unit_id" value="A009">
<input type="hidden" id="ecdt_sdate" name="ecdt_sdate" value="1150624">
<input type="hidden" name="pay_seqid" value="6078">
<input type="hidden" name="stdname" value="吳宸麒">
<input type="hidden" name="part_month" value="11506">
<input type="hidden" name="ls_kind_id" value="AA">
<input type="hidden" id="year" name="year" value="114">
<input type="hidden" id="sms" name="sms" value="2">
<table>
<tr id="tr_rowll1">
  <td><input type="hidden" id="etxt_date1" name="etxt_date1" value="1150601"></td>
  <td><select name="etxt_in1"><option value="0800" selected>08:00</option>
      <option value="0900">09:00</option></select></td>
  <td><select name="etxt_out1"><option value="0800">08:00</option>
      <option value="0900" selected>09:00</option></select></td>
  <td><input id="etxt_num1" name="etxt_num1" value="1.0"></td>
  <td><input type="hidden" id="etxt_dateseq1" name="etxt_dateseq1" value="565"></td>
</tr>
</table>
</form>
"""


def test_parse_master():
    r = parse_workstudy_master(MASTER_HTML)
    assert r["year"] == "114" and r["sms"] == "2"
    assert [m["value"] for m in r["months"]] == ["6", "7"]
    assert "A009§AA" in [u["value"] for u in r["units"]]
    assert len(r["records"]) == 1
    rec = r["records"][0]
    assert rec["unit_id"] == "A009" and rec["kind_id"] == "AA"
    assert rec["month"] == "6" and rec["hours"] == "9.0"
    assert rec["status"] == "未送件" and rec["editable"] is True


def test_parse_edit_meta_and_rows():
    r = parse_workstudy_edit(EDIT_HTML)
    meta = r["meta"]
    assert meta["pay_seqid"] == "6078"
    assert meta["unit_id"] == "A009"
    assert meta["ecdt_sdate"] == "1150624"
    assert meta["stdname"] == "吳宸麒"
    assert meta["part_month"] == "11506"
    # etxt_date / etxt_dateseq 不應混進 meta
    assert not any(k.startswith("etxt_") for k in meta)
    assert r["rows"] == [
        {"date": "1150601", "t_in": "0800", "t_out": "0900",
         "hours": "1.0", "seq": "565"},
    ]


def test_plan_fixed_pattern_weekday_and_slot():
    # 115/6 = 2026/06，pattern: 週二中午、週四早上
    entries = plan_shifts(115, 6, {2: ["1200"], 4: ["0800"]})
    assert entries, "should produce entries"
    for e in entries:
        assert e["t_in"] in ("0800", "1200")
        assert e["hours"] == "1.0"
        assert e["seq"] == ""   # 新列尚未配 seq


def test_plan_month_cap_and_skip():
    full = plan_shifts(115, 6, {2: ["1200"], 4: ["0800"]})
    capped = plan_shifts(115, 6, {2: ["1200"], 4: ["0800"]}, month_cap=3.0)
    assert len(capped) == 3
    skipped = plan_shifts(115, 6, {2: ["1200"], 4: ["0800"]},
                          skip_dates=[full[0]["date"]])
    assert full[0]["date"] not in [e["date"] for e in skipped]


def test_plan_schedule_guard_blocks_class_time():
    # 週二 0820-0910 有課 → 0800 段非空堂，pattern 排了也要被擋
    free = free_slots_from_schedule([{"weekday": 2, "time_range": "0820-0910"}])
    assert "0800" not in free[2] and "1200" in free[2]
    entries = plan_shifts(115, 6, {2: ["0800"]}, free_by_weekday=free)
    assert entries == []


def test_build_svalue_format():
    entries = [
        {"date": "1150601", "t_in": "0800", "t_out": "0900", "hours": "1.0", "seq": "565"},
        {"date": "1150602", "t_in": "1200", "t_out": "1300", "hours": "1.0", "seq": "096"},
    ]
    sv = _build_svalue(entries)
    assert sv == "1150601%0800%0900%1.0%565@1150602%1200%1300%1.0%096@120@"


def test_build_payload_keys():
    meta = {"unit_id": "A009", "ecdt_sdate": "1150624", "pay_seqid": "6078",
            "stdname": "吳宸麒", "part_month": "11506", "ls_kind_id": "AA",
            "year": "114", "sms": "2"}
    entries = [{"date": "1150601", "t_in": "0800", "t_out": "0900",
                "hours": "1.0", "seq": "565"}]
    p = _build_payload(meta, entries, "清寒學習服務生(A)")
    assert p["etxt_date1"] == "1150601"
    assert p["etxt_in1"] == "0800" and p["etxt_out1"] == "0900"
    assert p["etxt_dateseq1"] == "565"
    assert p["hr_count"] == "1.0"
    assert p["unit_A009"] == "清寒學習服務生(A)"
    assert p["pay_seqid"] == "6078"
    assert p["svalue"].endswith("@60@")
