"use client";

import React, { useState, useEffect, useMemo } from 'react'; // ★ 1. useMemo をインポート
import Link from 'next/link';
import { db } from '../../lib/firebase/firebase';
import { collection, getDocs, writeBatch, doc, query, orderBy } from 'firebase/firestore'; // ★ 2. query, orderBy をインポート
import { AppLayout } from '../../components/Layout';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { generateQrCard } from '@/lib/qr-printer'; // ★ Import

// Userタイプ (変更なし)
type User = {
  id: string;
  lastName: string;
  firstName: string;
  lastKana?: string; // (フリガナがあれば検索精度が向上)
  firstKana?: string; // (同上)
  jukyushaNo?: string;
  decisionEndDate?: string;
  serviceHoDay?: boolean;
  serviceJihatsu?: boolean;
  serviceSoudan?: boolean;
};

// ★ 3. ページネーションの件数
const USERS_PER_PAGE = 10;

export default function UsersPage() {
  // ★ 4. State の変更
  const [allUsers, setAllUsers] = useState<User[]>([]); // 全利用者データ (マスター)
  const [loading, setLoading] = useState(true); // (ローディングの State 名を変更)
  const [queryText, setQueryText] = useState(''); // ★ 5. 検索窓のテキスト
  const [currentPage, setCurrentPage] = useState(1); // ★ 6. 現在のページ番号

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ★ 7. fetchUsers のローディング処理を修正
  const fetchUsers = async () => {
    setLoading(true); // ローディング開始
    const usersCollectionRef = collection(db, 'users');
    // フリガナ(lastKana)での並び替えを推奨
    const q = query(usersCollectionRef, orderBy('lastName')); // (lastNameでソート)

    try {
      const querySnapshot = await getDocs(q);
      const usersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as User[];
      
      setAllUsers(usersData); // 全利用者をセット
    } catch (error) {
      console.error("利用者データの取得に失敗:", error);
      toast.error("利用者データの取得に失敗しました。");
    } finally {
      setLoading(false); // ローディング完了
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // ★ 8. 検索（絞り込み）機能 (useMemo)
  const filteredUsers = useMemo(() => {
    // 検索窓が空なら、全員を表示
    if (!queryText) {
      return allUsers;
    }
    
    const normalizedQuery = queryText.trim().toLowerCase(); // " 田 " などを "田" に
    
    return allUsers.filter(user => {
      const fullName = `${user.lastName || ''}${user.firstName || ''}`;
      // (もしフリガナ(kana)もあれば、ここで検索対象に追加)
      // const fullNameKana = `${user.lastKana || ''}${user.firstKana || ''}`;
      
      // 氏名に検索クエリが含まれているかチェック
      return fullName.toLowerCase().includes(normalizedQuery);
    });
  }, [queryText, allUsers]); // queryText か allUsers が変わったら再実行

  // ★ 9. ページネーション（切り出し）機能 (useMemo)
  const { paginatedUsers, totalPages, totalCount } = useMemo(() => {
    const indexOfLastUser = currentPage * USERS_PER_PAGE;
    const indexOfFirstUser = indexOfLastUser - USERS_PER_PAGE;
    
    const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);
    const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
    
    return { 
      paginatedUsers: currentUsers, 
      totalPages: totalPages,
      totalCount: filteredUsers.length // 絞り込み後の合計件数
    };
  }, [currentPage, filteredUsers]); // currentPage か filteredUsers が変わったら再実行

  
  // --- CSVアップロード関連 (変更なし) ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // ...
    if (e.target.files) {
      setCsvFile(e.target.files[0]);
    }
  };
  const handleUpload = () => {
    // ...
    if (!csvFile) {
      toast.error('CSVファイルを選択してください。');
      return;
    }
    setIsUploading(true);
    toast.promise(
      new Promise<string>((resolve, reject) => {
        Papa.parse(csvFile, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const batch = writeBatch(db);
              results.data.forEach((row: any) => {
                const userRef = doc(collection(db, 'users'));
                const newUser = {
                  ...row,
                  serviceHoDay: row.serviceHoDay === '1',
                  serviceJihatsu: row.serviceJihatsu === '1',
                  serviceSoudan: row.serviceSoudan === '1',
                };
                batch.set(userRef, newUser);
              });
              await batch.commit();
              resolve('一括登録が完了しました。');
            } catch (error) {
              console.error(error);
              reject(new Error('一括登録中にエラーが発生しました。'));
            }
          },
          error: (error) => {
            console.error(error);
            reject(new Error('CSVファイルの解析に失敗しました。'));
          }
        });
      }),
      {
        loading: 'CSVファイルをアップロード中...',
        success: (message: string) => {
          fetchUsers(); // データを再取得
          setIsModalOpen(false);
          setIsUploading(false);
          setCsvFile(null);
          return message;
        },
        error: (err) => {
          setIsUploading(false);
          const errorMessage = err instanceof Error ? err.message : '不明なエラーが発生しました。';
          return errorMessage;
        },
      }
    );
  };
  const downloadTemplate = () => {
    // ...
    const headers = "lastName,firstName,lastKana,firstKana,birthday,gender,schoolName,schoolGrade,guardianLastName,guardianFirstName,postalCode,address,contact,contactPerson,allergies,serviceHoDay,serviceJihatsu,serviceSoudan,jukyushaNo,issueDate,cityNo,cityName,daysSpecified,daysDeducted,decisionStartDate,decisionEndDate,upperLimitAmount,upperLimitStartDate,upperLimitEndDate,contractStartDate,contractEndDate,providerNoteNo,contractedAmount,individualSupportSurcharge,selfRelianceSurcharge,capManagementType,capOfficeNo,capOfficeName";
    const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "import_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  // --- CSVアップロード関連 (ここまで) ---

  return (
    <AppLayout pageTitle="利用者一覧">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">利用者一覧</h1>
          
          {/* ★ 10. 検索窓とボタンのエリア */}
          <div className="flex-1 flex justify-end items-center space-x-2">
            {/* 検索窓 */}
            <input
              type="text"
              value={queryText}
              onChange={(e) => {
                setQueryText(e.target.value);
                setCurrentPage(1); // 検索したら1ページ目に戻す
              }}
              placeholder="氏名で検索..."
              className="p-2 border border-gray-300 rounded-lg"
            />
            {/* 既存のボタン */}
            <button onClick={() => setIsModalOpen(true)} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">
              一括登録
            </button>
            <Link href="/users/new" className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">
              新規登録
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
              {/* ★ 11. ローディング表示 */}
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 px-4 text-center text-gray-500">
                    データを読み込んでいます...
                  </td>
                </tr>
              ) : paginatedUsers.length > 0 ? (
                // ★ 12. 絞り込んだ (paginatedUsers) リストを表示
                paginatedUsers.map(user => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {`${user.lastName} ${user.firstName}`}
                      <div className="flex items-center space-x-2 mt-1">
                        {user.serviceHoDay && <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-sky-600 bg-sky-200">放デイ</span>}
                        {user.serviceJihatsu && <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-emerald-600 bg-emerald-200">児発</span>}
                        {user.serviceSoudan && <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-amber-600 bg-amber-200">相談</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.jukyushaNo || '未設定'}</td>
                    <td className="px-6 py-4 whitespace-nowTBAp text-sm text-gray-500">{user.decisionEndDate || '未設定'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {/* ★★★ 修正箇所: シンプルなテキストボタンに変更 ★★★ */}
                        <Link href={`/users/${user.id}`} className="text-indigo-600 hover:text-indigo-900 font-bold">
                          詳細
                        </Link>
                        <button
                          onClick={() => generateQrCard(user.id, `${user.lastName} ${user.firstName}`)}
                          className="text-gray-500 hover:text-blue-600 font-bold transition-colors"
                        >
                          QR作成
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                // ★ 13. 検索結果0件の表示
                <tr>
                  <td colSpan={4} className="py-8 px-4 text-center text-gray-500">
                    {queryText ? '該当する利用者がいません' : '利用者が登録されていません'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ★ 14. ページネーション UI */}
        <div className="flex justify-between items-center mt-6">
          <span className="text-sm text-gray-700">
            {totalCount} 件中 {paginatedUsers.length > 0 ? Math.min((currentPage - 1) * USERS_PER_PAGE + 1, totalCount) : 0} - {Math.min(currentPage * USERS_PER_PAGE, totalCount)} 件を表示
          </span>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || loading}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              前へ
            </button>
            <span className="py-2 px-4 text-sm text-gray-700">
              {totalPages > 0 ? `${currentPage} / ${totalPages}` : '0 / 0'}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0 || loading}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              次へ
            </button>
          </div>
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg">
              <h3 className="text-xl font-bold mb-6">利用者の一括登録 (CSV)</h3>
              <div className="mb-4">
                <button onClick={downloadTemplate} className="text-sm text-blue-500 hover:text-blue-600 hover:underline">
                  テンプレートファイル(CSV)をダウンロード
                </button>
              </div>
              <div className="mb-6">
                <label htmlFor="csv-upload" className="block text-sm font-medium text-gray-700 mb-2">CSVファイルを選択</label>
                <input id="csv-upload" type="file" accept=".csv" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
              </div>
              <p className="text-xs text-gray-500 mb-6">
                ※ 1行目には必ずヘッダー（lastName, firstNameなど）を含めてください。<br/>
                ※ 文字コードはUTF-8で保存してください。
              </p>
              <div className="flex justify-end space-x-4">
                <button onClick={() => setIsModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg">
                  キャンセル
                </button>
                <button onClick={handleUpload} disabled={isUploading || !csvFile} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-blue-300 disabled:cursor-not-allowed">
                  {isUploading ? '登録中...' : '登録する'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}