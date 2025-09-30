"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '../../lib/firebase/firebase'; // パスを修正
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { AppLayout } from '../../components/Layout'; // パスを修正
import Papa from 'papaparse';

// 【変更点①】 Userタイプに表示とソートに必要なプロパティを追加
type User = {
  id: string;
  lastName: string;
  firstName: string;
  jukyushaNo?: string; // 受給者証番号 (存在しない場合もあるのでオプショナルに)
  decisionEndDate?: string; // 給付決定終了日 (同様にオプショナルに)
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fetchUsers = async () => {
    const usersCollectionRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersCollectionRef);
    const usersData = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as User[];

    // 【変更点②】 取得したデータを並び替える処理を追加
    usersData.sort((a, b) => {
      const aNo = a.jukyushaNo;
      const bNo = b.jukyushaNo;

      // aかbの受給者証番号が空欄の場合のロジック
      if (!aNo && !bNo) return 0; // 両方空なら順序はそのまま
      if (!aNo) return -1;       // aが空ならaを前に
      if (!bNo) return 1;        // bが空ならbを前に

      // 両方に番号がある場合は、文字列として比較して昇順に並び替え
      return aNo.localeCompare(bNo);
    });

    setUsers(usersData);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setCsvFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!csvFile) {
      alert('CSVファイルを選択してください。');
      return;
    }
    setIsUploading(true);

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const batch = writeBatch(db);
          results.data.forEach((row: any) => {
            // Firestoreのusersコレクション内に新しいドキュメント参照を作成
            const userRef = doc(collection(db, 'users'));
            batch.set(userRef, row);
          });
          await batch.commit();
          alert(`${results.data.length}件の利用者を登録しました。`);
          await fetchUsers(); // リストを更新
          setIsModalOpen(false);
        } catch (error) {
          console.error("一括登録エラー:", error);
          alert('一括登録に失敗しました。CSVの形式を確認してください。');
        } finally {
          setIsUploading(false);
          setCsvFile(null);
        }
      },
      error: (error: any) => {
        console.error("CSV解析エラー:", error);
        alert('CSVファイルの解析に失敗しました。');
        setIsUploading(false);
      }
    });
  };

  const handleDownloadTemplate = () => {
    const header = "lastName,firstName,lastKana,firstKana,birthday,gender,schoolName,schoolGrade,guardianLastName,guardianFirstName,postalCode,address,contact,contactPerson,allergies,serviceHoDay,serviceJihatsu,serviceSoudan,jukyushaNo,issueDate,cityNo,cityName,daysSpecified,daysDeducted,decisionStartDate,decisionEndDate,upperLimitAmount,upperLimitStartDate,upperLimitEndDate,contractStartDate,contractEndDate,providerNoteNo,contractedAmount,individualSupportSurcharge,selfRelianceSurcharge,capManagementType,capOfficeNo,capOfficeName";
    const blob = new Blob([header], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "import_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <AppLayout pageTitle="利用者管理">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-ios border border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold text-gray-800">登録済み利用者一覧</h2>
          <div className="flex space-x-3">
            <button onClick={() => setIsModalOpen(true)} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">
              CSV一括登録
            </button>
            <Link href="/users/new">
              <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-400">
                新規利用者を登録
              </button>
            </Link>
          </div>
        </div>
        
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">氏名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">受給者証番号</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">給付決定終了日</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map(user => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{`${user.lastName} ${user.firstName}`}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.jukyushaNo || '未設定'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.decisionEndDate || '未設定'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/users/${user.id}`} className="text-indigo-600 hover:text-indigo-900">
                      詳細・編集
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>


      {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg">
              <h3 className="text-xl font-bold text-gray-800 mb-4">CSVファイルで一括登録</h3>
              
              {/* ★ ダウンロードボタンを追加 ★ */}
              <div className="mb-4">
                <button onClick={handleDownloadTemplate} className="text-sm font-semibold text-blue-600 hover:underline">
                  テンプレートファイル(CSV)をダウンロード
                </button>
              </div>

              <div className="mb-6">
                <label htmlFor="csv-upload" className="block text-sm font-medium text-gray-700 mb-2">CSVファイルを選択</label>
                <input 
                  id="csv-upload"
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileChange} 
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <p className="text-xs text-gray-500 mb-6">
                ※ 1行目には必ずヘッダー（lastName, firstNameなど）を含めてください。<br/>
                ※ 文字コードはUTF-8で保存してください。
              </p>
              <div className="flex justify-end space-x-4">
                <button onClick={() => setIsModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">
                  キャンセル
                </button>
                <button onClick={handleUpload} disabled={isUploading || !csvFile} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400">
                  {isUploading ? '登録中...' : 'アップロード'}
                </button>
              </div>
            </div>
          </div>
        )}
    </AppLayout>
  );
}

