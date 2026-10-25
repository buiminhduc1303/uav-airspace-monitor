import React, { useEffect } from 'react';
import { initEngine } from './engine';

export default function App() {
  useEffect(() => {
    initEngine();
  }, []);

  return (
    <div id="app">
      <header>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" stroke="#2f80ff" strokeWidth="2" />
          <circle cx="20" cy="20" r="11" fill="none" stroke="#19d38c" strokeWidth="1.2" />
          <path d="M20 6l3 12 9 4v3l-9-2-1 7 3 2v2l-5-1-5 1v-2l3-2-1-7-9 2v-3l9-4z" fill="#fff" />
        </svg>
        <div className="tt">
          <h1>TSN AIRSPACE MONITOR</h1>
          <small>HỆ THỐNG GIÁM SÁT &amp; CẢNH BÁO UAV XÂM NHẬP · VVTS – TÂN SƠN NHẤT</small>
        </div>
        <div className="clk">
          UTC <b id="utc">--:--:--</b><br />
          ICT <b id="ict">--:--:--</b>
        </div>
      </header>
      <main>
        <section className="left">
          <div className="tb">
            <button id="bPlay" className="pri">⏸ Tạm dừng</button>
            <button id="bReset">↺ Đặt lại</button>
            <div className="zone-tracker" id="zoneTracker" title="Số lượng UAV theo từng phân vùng giám sát">
              <div className="zt-badge zt-safe" title="UAV trong vùng An toàn (Không có nguy cơ xâm nhập)">
                <span className="zt-dot"></span>
                <span className="zt-title">An toàn</span>
                <span className="zt-num" id="cSafe">0</span>
              </div>
              <div className="zt-badge zt-warn" title="UAV trong vùng Hạn chế hoặc có xu hướng tiếp cận cảnh báo">
                <span className="zt-dot"></span>
                <span className="zt-title">Hạn chế</span>
                <span className="zt-num" id="cWarn">0</span>
              </div>
              <div className="zt-badge zt-danger" id="ztDangerBadge" title="UAV đã xâm nhập vùng cấm bay">
                <span className="zt-dot"></span>
                <span className="zt-title">Vùng cấm</span>
                <span className="zt-num" id="cDanger">0</span>
              </div>
            </div>
            <label>Tốc độ mô phỏng <select id="sMult" defaultValue="20">
                <option value="1">1</option>
                <option value="5">5</option>
                <option value="20">20</option>
                <option value="60">60</option>
                <option value="120">120</option>
              </select>×
            </label>
            <label>Tầm <select id="sRange" defaultValue="40">
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="60">60</option>
              </select>km
            </label>
            <span className="sep"></span>
            <button id="vRadar" className="on">◎ Radar</button>
            <button id="vMap">🗺 Bản đồ</button>
            <button id="bSnd" className="on">🔔 Âm báo</button>
          </div>
          <div className="cvw">
            <canvas id="cv"></canvas>
            <div className="lg">
              <div><i style={{ background: 'rgba(255,77,79,.75)' }}></i>Vùng cấm UAV</div>
              <div><i style={{ background: 'rgba(255,176,32,.75)' }}></i>Vùng hạn chế / cảnh báo</div>
              <div><i style={{ background: '#19d38c' }}></i>UAV an toàn (Không xu hướng xâm nhập)</div>
              <div><i style={{ background: '#ffb020' }}></i>UAV cảnh báo (Có xu hướng xâm nhập)</div>
              <div><i style={{ background: '#ff4d4f' }}></i>UAV đã xâm nhập</div>
            </div>
            <div className="hud" id="hud">Rê chuột trên màn hình để xem toạ độ · Nhấp để chọn vị trí xuất hiện</div>
          </div>
          <div className="st">
            <span>Mục tiêu: <b id="nT">0</b></span>
            <span>Cảnh báo: <b id="nW">0</b></span>
            <span>Xâm nhập: <b id="nI">0</b></span>
            <span className="sep"></span>
            <span>Mô phỏng phục vụ học tập – không dùng cho khai thác thực tế</span>
          </div>
        </section>
        <aside>
          <div className="tabs">
            <button className="on" data-p="p1">Mục tiêu UAV</button>
            <button data-p="p2">Cảnh báo</button>
            <button data-p="p3">Sân bay</button>
          </div>
          <div className="pane on" id="p1">
            <h3>Nhập dữ liệu UAV</h3>
            <div className="fm">
              <label className="full">Tên<input id="fN" placeholder="VD: UAV-X1" /></label>
              <label>Hướng từ ARP (°)<input id="fB" type="number" defaultValue="265" min="0" max="359" /></label>
              <label>Cách ARP (km)<input id="fD" type="number" defaultValue="30" min="1" max="70" step="0.5" /></label>
              <label>Hướng bay (°)<input id="fH" type="number" defaultValue="85" min="0" max="359" /></label>
              <label>Tốc độ (m/s)<input id="fS" type="number" defaultValue="20" min="1" max="80" /></label>
              <label>Tốc độ tối đa (m/s)<input id="fMaxS" type="number" defaultValue="25" min="5" max="100" /></label>
              <label>Độ cao (m)<input id="fA" type="number" defaultValue="150" min="0" max="3000" /></label>
            </div>
            <div className="btns">
              <button className="pri" id="bAdd">+ Thêm UAV</button>
              <button id="bAddParallelForm" title="Thêm mục tiêu UAV song song cách vùng hạn chế 3km">+ UAV Song song (3km)</button>
              <button id="bSep" title="Phân tách giãn cách các mục tiêu UAV khi bị chồng lấn">↔ Tách mục tiêu</button>
              <button id="bAim">Bay vào tâm</button>
              <button id="bRnd">Ngẫu nhiên</button>
              <button id="bClr">Xoá hết</button>
            </div>
            <h3 id="hT">Danh sách mục tiêu</h3>
            <div id="list"></div>
          </div>
          <div className="pane" id="p2">
            <h3>Nhật ký cảnh báo</h3>
            <div id="logs"></div>
          </div>
          <div className="pane" id="p3">
            <h3>Điểm quy chiếu sân bay (ARP)</h3>
            <table>
              <tbody>
                <tr><th>Toạ độ</th><td>10°49′14″N – 106°39′39″E</td></tr>
                <tr><th>Cao độ</th><td>10 m (33 ft) so với mực nước biển</td></tr>
              </tbody>
            </table>
            <h3>Đường cất hạ cánh</h3>
            <table>
              <thead>
                <tr><th>RWY</th><th>THR</th><th>Hướng</th></tr>
              </thead>
              <tbody>
                <tr><td>07L</td><td>10°48′54.07″N 106°38′13.65″E</td><td>069°</td></tr>
                <tr><td>25R</td><td>10°49′29.48″N 106°39′47.43″E</td><td>249°</td></tr>
                <tr><td>07R</td><td>10°48′40.93″N 106°38′12.58″E</td><td>069°</td></tr>
                <tr><td>25L</td><td>10°49′25″N 106°40′10″E</td><td>249°</td></tr>
              </tbody>
            </table>
            <h3>Phân vùng</h3>
            <table>
              <tbody>
                <tr><th>Vùng cấm UAV</th><td>32,8 × 10,4 km (dọc trục đường băng 069°)</td></tr>
                <tr><th>Vùng hạn chế / cảnh báo</th><td>46,8 × 19,4 km (mở rộng quanh vùng cấm)</td></tr>
                <tr><th>Dự báo xâm nhập</th><td>Cảnh báo sớm khi ETA ≤ 180 s</td></tr>
              </tbody>
            </table>
            <h3>Hệ thống cảm biến C-UAV Tân Sơn Nhất</h3>
            <table>
              <tbody>
                <tr><th>4 Radar</th><td>R = 25 km / trạm (bố trí 17,5 km từ tâm: R1-Bắc, R2-Đông, R3-Nam, R4-Tây)</td></tr>
                <tr><th>8 trạm RF</th><td>R = 12 km / trạm (RF-N1..N3, RF-S1..S3, RF-W, RF-E)</td></tr>
                <tr><th>14 Camera EO/IR/PTZ</th><td>R = 6 km / camera (7 Bắc C-N1..N7 + 7 Nam C-S1..S7)</td></tr>
              </tbody>
            </table>
            <h3>Cấp độ nhận dạng mục tiêu</h3>
            <table>
              <tbody>
                <tr><th>Chỉ phủ Radar</th><td>Hiển thị: <code>UNKNOWN</code></td></tr>
                <tr><th>Phủ Radar + RF</th><td>Hiển thị: <code>PROBABLE [Tên dự đoán]</code></td></tr>
                <tr><th>Phủ Camera EO/IR/PTZ</th><td>Nhận dạng chính xác: <code>[Tên mục tiêu cụ thể]</code></td></tr>
              </tbody>
            </table>
          </div>
        </aside>
      </main>
    </div>
  );
}
