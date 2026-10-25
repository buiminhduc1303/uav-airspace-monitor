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
              <div><i style={{ background: 'rgba(255,77,79,.5)' }}></i>Khu vực cấm bay</div>
              <div><i style={{ background: 'rgba(255,176,32,.45)' }}></i>Khu vực hạn chế bay</div>
              <div><i style={{ background: '#19d38c' }}></i>UAV an toàn</div>
              <div><i style={{ background: '#ffb020' }}></i>UAV cảnh báo</div>
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
            <button data-p="p2">Cảnh báo <span className="chip c3" id="bg">0</span></button>
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
              <label>Độ cao (m)<input id="fA" type="number" defaultValue="150" min="0" max="3000" /></label>
            </div>
            <div className="btns">
              <button className="pri" id="bAdd">+ Thêm UAV</button>
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
                <tr><th>Cấm bay</th><td>Cách mép đường băng 15 km hai đầu, 5 km hai bên</td></tr>
                <tr><th>Hạn chế</th><td>Mở rộng thêm 3 km quanh vùng cấm</td></tr>
                <tr><th>Cảnh báo</th><td>Dự báo xâm nhập ≤ 180 s</td></tr>
              </tbody>
            </table>
          </div>
        </aside>
      </main>
    </div>
  );
}
