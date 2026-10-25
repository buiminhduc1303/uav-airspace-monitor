import React, { useEffect } from 'react';
import {
  Pause, Play, RotateCcw, Bell, BellOff, FastForward, Radar, Plus, Shuffle, Trash2,
  Crosshair, AlertTriangle, PlaneLanding, MapPin, Layers, Radio, ScanEye, Tag, ChevronDown, Activity, Clock,
} from 'lucide-react';
import { initEngine } from './engine';

export default function App() {
  useEffect(() => {
    initEngine();
  }, []);

  return (
    <div id="app">
      <header className="appbar">
        <div className="brand">
          <svg className="brand-mark" width="36" height="36" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="none" stroke="#3b82f6" strokeWidth="2" />
            <circle cx="20" cy="20" r="11" fill="none" stroke="#19d38c" strokeWidth="1.2" />
            <path d="M20 6l3 12 9 4v3l-9-2-1 7 3 2v2l-5-1-5 1v-2l3-2-1-7-9 2v-3l9-4z" fill="#fff" />
          </svg>
          <div className="tt">
            <h1>TSN AIRSPACE MONITOR</h1>
            <small>HỆ THỐNG GIÁM SÁT &amp; CẢNH BÁO UAV XÂM NHẬP · VVTS – TÂN SƠN NHẤT</small>
          </div>
        </div>
        <div className="clk" aria-label="Đồng hồ hệ thống">
          <div className="clk-cell"><span>UTC</span><b id="utc">--:--:--</b></div>
          <div className="clk-cell"><span>ICT</span><b id="ict">--:--:--</b></div>
        </div>
      </header>

      <main>
        <section className="left">
          <div className="tb" role="toolbar" aria-label="Điều khiển mô phỏng">
            <div className="tb-group">
              <button id="bPlay" type="button" aria-pressed="false" title="Tạm dừng / tiếp tục mô phỏng">
                <Pause className="ic i-pause" aria-hidden="true" />
                <Play className="ic i-play" aria-hidden="true" />
                <span className="lbl">Tạm dừng</span>
              </button>
              <button id="bReset" type="button" title="Đặt lại kịch bản mặc định" aria-label="Đặt lại">
                <RotateCcw className="ic" aria-hidden="true" />
                <span className="lbl-collapse">Đặt lại</span>
              </button>
            </div>

            <span className="tb-div" aria-hidden="true"></span>

            <div className="zone-tracker" id="zoneTracker" role="group" aria-label="Lọc mục tiêu theo trạng thái">
              <button type="button" className="zt-badge zt-safe" data-filter="s" aria-pressed="true" title="Bật/tắt hiển thị UAV an toàn (không có nguy cơ xâm nhập)">
                <span className="zt-sym sym sym-s" aria-hidden="true"></span>
                <span className="zt-title">An toàn</span>
                <span className="zt-num" id="cSafe">0</span>
              </button>
              <button type="button" className="zt-badge zt-warn" data-filter="w" aria-pressed="true" title="Bật/tắt hiển thị UAV trong vùng hạn chế hoặc có xu hướng xâm nhập">
                <span className="zt-sym sym sym-w" aria-hidden="true"></span>
                <span className="zt-title">Hạn chế</span>
                <span className="zt-num" id="cWarn">0</span>
              </button>
              <button type="button" className="zt-badge zt-danger" id="ztDangerBadge" data-filter="d" aria-pressed="true" title="Bật/tắt hiển thị UAV đã xâm nhập vùng cấm bay">
                <span className="zt-sym sym sym-d" aria-hidden="true"></span>
                <span className="zt-title">Vùng cấm</span>
                <span className="zt-num" id="cDanger">0</span>
              </button>
            </div>

            <span className="sep"></span>

            <label className="sel">
              <FastForward className="ic" aria-hidden="true" />
              <span className="sel-lbl">Tốc độ mô phỏng:</span>
              <select id="sMult" defaultValue="20" aria-label="Tốc độ mô phỏng">
                <option value="1">1×</option>
                <option value="5">5×</option>
                <option value="20">20×</option>
                <option value="60">60×</option>
                <option value="120">120×</option>
              </select>
            </label>
            <button id="bSnd" className="on toggle" type="button" aria-pressed="true" title="Bật/tắt âm báo">
              <Bell className="ic i-on" aria-hidden="true" />
              <BellOff className="ic i-off" aria-hidden="true" />
              <span className="lbl">Âm báo: Bật</span>
            </button>
          </div>

          <div className="cvw">
            <canvas id="cv" aria-label="Màn hình radar PPI"></canvas>
            <div className="cv-tools">
              <button id="bLbl" className="ov-btn on" type="button" aria-pressed="true" title="Bật/tắt nhãn rút gọn trên radar (nhãn đầy đủ vẫn hiện khi rê chuột hoặc chọn mục tiêu). Kéo nhãn để di chuyển, nhấp đúp để đặt lại.">
                <Tag className="ic" aria-hidden="true" />
                <span className="lbl">Nhãn: Bật</span>
              </button>
              <label className="sel sel-range ov-sel">
                <Radar className="ic" aria-hidden="true" />
                <span className="sel-lbl">Tầm:</span>
                <select id="sRange" defaultValue="40" aria-label="Tầm hiển thị radar">
                  <option value="10">10 km</option>
                  <option value="20">20 km</option>
                  <option value="40">40 km</option>
                  <option value="60">60 km</option>
                </select>
              </label>
            </div>
            <details className="lg">
              <summary>Chú giải <ChevronDown className="ic chev" aria-hidden="true" /></summary>
              <div className="lg-body">
                <div><i className="zsw zsw-p"></i>Vùng cấm UAV</div>
                <div><i className="zsw zsw-r"></i>Vùng hạn chế / cảnh báo</div>
                <div className="lg-sep"></div>
                <div><span className="sym sym-s"></span>UAV an toàn (Không xu hướng xâm nhập)</div>
                <div><span className="sym sym-w"></span>UAV cảnh báo (Có xu hướng xâm nhập)</div>
                <div><span className="sym sym-d"></span>UAV đã xâm nhập</div>
                <div className="lg-sep"></div>
                <div><i className="vec"></i>Vector dự báo 60 s</div>
                <div><i className="trl"></i>Vệt lịch sử 60 s</div>
              </div>
            </details>
            <div className="hud-wrap">
              <Crosshair className="ic" aria-hidden="true" />
              <div className="hud" id="hud">Rê chuột trên màn hình để xem toạ độ · Nhấp để chọn vị trí xuất hiện</div>
            </div>
          </div>

          <footer className="st">
            <span className="st-item"><Activity className="ic" aria-hidden="true" />FPS <b id="fps">--</b></span>
            <span className="st-item"><Clock className="ic" aria-hidden="true" />Cập nhật lúc <b id="upd">--:--:--</b></span>
            <span className="sep"></span>
            <span className="st-note">Mô phỏng phục vụ học tập – không dùng cho khai thác thực tế</span>
          </footer>
        </section>

        <aside>
          <div className="tabs" role="tablist">
            <button className="on" data-p="p1" type="button" role="tab" aria-selected="true">
              <Crosshair className="ic" aria-hidden="true" />Mục tiêu UAV
            </button>
            <button data-p="p2" type="button" role="tab" aria-selected="false">
              <AlertTriangle className="ic" aria-hidden="true" />Cảnh báo
            </button>
            <button data-p="p3" type="button" role="tab" aria-selected="false">
              <PlaneLanding className="ic" aria-hidden="true" />Sân bay
            </button>
          </div>

          <div className="pane on" id="p1" role="tabpanel">
            <details className="panel add-form" id="addForm">
              <summary>
                <Plus className="ic" aria-hidden="true" />
                <span>Thêm UAV</span>
                <ChevronDown className="ic chev" aria-hidden="true" />
              </summary>
              <h3>Nhập dữ liệu UAV</h3>
              <div className="fm">
                <label className="full">Tên<input id="fN" placeholder="VD: UAV-X1" autoComplete="off" /></label>
                <label>Hướng từ ARP (°)<input id="fB" type="number" defaultValue="265" min="0" max="359" /></label>
                <label>Cách ARP (km)<input id="fD" type="number" defaultValue="30" min="1" max="70" step="0.5" /></label>
                <label>Hướng bay (°)<input id="fH" type="number" defaultValue="85" min="0" max="359" /></label>
                <label>Tốc độ (m/s)<input id="fS" type="number" defaultValue="20" min="1" max="80" /></label>
                <label>Tốc độ tối đa (m/s)<input id="fMaxS" type="number" defaultValue="25" min="5" max="100" /></label>
                <label>Độ cao (m)<input id="fA" type="number" defaultValue="150" min="0" max="3000" /></label>
              </div>
              <p className="hint">Mẹo: nhấp lên radar để lấy hướng &amp; khoảng cách từ ARP.</p>
              <div className="btns">
                <button className="pri grow" id="bAdd" type="button">
                  <Plus className="ic" aria-hidden="true" />Thêm UAV
                </button>
                <button id="bRnd" type="button">
                  <Shuffle className="ic" aria-hidden="true" />Ngẫu nhiên
                </button>
                <button id="bClr" className="danger-ghost" type="button">
                  <Trash2 className="ic" aria-hidden="true" />Xoá hết
                </button>
              </div>
            </details>
            <h3 id="hT" className="list-head">Danh sách mục tiêu</h3>
            <div id="list" aria-live="off"></div>
          </div>

          <div className="pane" id="p2" role="tabpanel">
            <h3>Nhật ký cảnh báo</h3>
            <div id="logs"></div>
          </div>

          <div className="pane" id="p3" role="tabpanel">
            <section className="panel">
              <h3><MapPin className="ic" aria-hidden="true" />Điểm quy chiếu sân bay (ARP)</h3>
              <table className="kv">
                <tbody>
                  <tr><th>Toạ độ</th><td>10°49′14″N – 106°39′39″E</td></tr>
                  <tr><th>Cao độ</th><td>10 m (33 ft) so với mực nước biển</td></tr>
                </tbody>
              </table>
            </section>
            <section className="panel">
              <h3><PlaneLanding className="ic" aria-hidden="true" />Đường cất hạ cánh</h3>
              <table className="grid-t">
                <thead>
                  <tr><th>RWY</th><th>THR</th><th>Hướng</th></tr>
                </thead>
                <tbody>
                  <tr><td><span className="rwy">07L</span></td><td>10°48′54.07″N 106°38′13.65″E</td><td>069°</td></tr>
                  <tr><td><span className="rwy">25R</span></td><td>10°49′29.48″N 106°39′47.43″E</td><td>249°</td></tr>
                  <tr><td><span className="rwy">07R</span></td><td>10°48′40.93″N 106°38′12.58″E</td><td>069°</td></tr>
                  <tr><td><span className="rwy">25L</span></td><td>10°49′25″N 106°40′10″E</td><td>249°</td></tr>
                </tbody>
              </table>
            </section>
            <section className="panel">
              <h3><Layers className="ic" aria-hidden="true" />Phân vùng</h3>
              <table className="kv">
                <tbody>
                  <tr><th><i className="zdot zd-p"></i>Vùng cấm UAV</th><td>32,8 × 10,4 km (dọc trục đường băng 069°)</td></tr>
                  <tr><th><i className="zdot zd-r"></i>Vùng hạn chế / cảnh báo</th><td>46,8 × 19,4 km (mở rộng quanh vùng cấm)</td></tr>
                  <tr><th>Dự báo xâm nhập</th><td>Cảnh báo sớm khi ETA ≤ <span id="tWarn">300</span> s</td></tr>
                </tbody>
              </table>
            </section>
            <section className="panel">
              <h3><Radio className="ic" aria-hidden="true" />Hệ thống cảm biến C-UAV Tân Sơn Nhất</h3>
              <table className="kv">
                <tbody>
                  <tr><th>4 Radar</th><td>R = 25 km / trạm (bố trí 17,5 km từ tâm: R1-Bắc, R2-Đông, R3-Nam, R4-Tây)</td></tr>
                  <tr><th>8 trạm RF</th><td>R = 12 km / trạm (RF-N1..N3, RF-S1..S3, RF-W, RF-E)</td></tr>
                  <tr><th>14 Camera EO/IR/PTZ</th><td>R = 6 km / camera (7 Bắc C-N1..N7 + 7 Nam C-S1..S7)</td></tr>
                </tbody>
              </table>
            </section>
            <section className="panel">
              <h3><ScanEye className="ic" aria-hidden="true" />Cấp độ nhận dạng mục tiêu</h3>
              <table className="kv">
                <tbody>
                  <tr><th>Chỉ phủ Radar</th><td>Hiển thị: <code>[Tên] · chưa nhận dạng</code></td></tr>
                  <tr><th>Phủ Radar + RF</th><td>Hiển thị: <code>[Tên] · dự đoán</code></td></tr>
                  <tr><th>Phủ Camera EO/IR/PTZ</th><td>Nhận dạng chính xác: <code>[Tên mục tiêu cụ thể]</code></td></tr>
                </tbody>
              </table>
            </section>
          </div>
        </aside>
      </main>
    </div>
  );
}
