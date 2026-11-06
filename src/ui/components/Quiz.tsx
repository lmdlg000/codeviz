import { useEffect, useMemo, useState } from 'react';
import type { QuizQuestion } from '../../data/types';
import { clearQuizRecord, readQuizRecord, writeQuizRecord, type QuizRecord } from '../lib/progress';
import { InlineText } from '../lib/markdown';
import { Icon } from './Icon';
import { Button } from './Button';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export interface QuizProps {
  lessonId: string;
  questions: QuizQuestion[];
}

/** 随堂测验：选择 → 查看答案 → 得分 / 重试，答案持久化在 localStorage。 */
export function Quiz({ lessonId, questions }: QuizProps) {
  const [record, setRecord] = useState<QuizRecord>(() => readQuizRecord(lessonId));

  useEffect(() => {
    setRecord(readQuizRecord(lessonId));
  }, [lessonId]);

  const answeredCount = useMemo(
    () => questions.filter((question) => typeof record.answers[question.id] === 'number').length,
    [questions, record.answers],
  );
  const allAnswered = questions.length > 0 && answeredCount === questions.length;
  const score = useMemo(
    () => questions.filter((question) => record.answers[question.id] === question.answer).length,
    [questions, record.answers],
  );

  if (questions.length === 0) return null;

  const choose = (questionId: string, optionIndex: number): void => {
    if (record.revealed) return;
    const next: QuizRecord = {
      ...record,
      answers: { ...record.answers, [questionId]: optionIndex },
    };
    setRecord(next);
    writeQuizRecord(lessonId, next);
  };

  const reveal = (): void => {
    if (!allAnswered) return;
    const next: QuizRecord = { ...record, revealed: true };
    setRecord(next);
    writeQuizRecord(lessonId, next);
  };

  const retry = (): void => {
    clearQuizRecord(lessonId);
    setRecord({ answers: {}, revealed: false });
  };

  return (
    <section className="quiz" aria-labelledby="quiz-heading">
      <header className="quiz__head">
        <div>
          <span className="eyebrow">
            <span className="eyebrow__dot" aria-hidden="true" />
            QUIZ
          </span>
          <h2 className="quiz__title" id="quiz-heading">
            随堂测验
          </h2>
        </div>
        <span className="quiz__count tabular">共 {questions.length} 题</span>
      </header>

      <ol className="quiz__list">
        {questions.map((question, questionIndex) => {
          const selected = record.answers[question.id];
          const isCorrect = selected === question.answer;
          return (
            <li className="quiz__question" key={question.id}>
              <div className="quiz__question-head">
                <span className="quiz__index tabular">{String(questionIndex + 1).padStart(2, '0')}</span>
                <p className="quiz__question-text" id={`quiz-q-${question.id}`}>
                  <InlineText text={question.question} />
                </p>
              </div>

              <div
                className="quiz__options"
                role="radiogroup"
                aria-labelledby={`quiz-q-${question.id}`}
              >
                {question.options.map((option, optionIndex) => {
                  const isSelected = selected === optionIndex;
                  const isAnswer = question.answer === optionIndex;
                  const classes = ['quiz__option'];
                  if (!record.revealed && isSelected) classes.push('is-selected');
                  if (record.revealed && isAnswer) classes.push('is-correct');
                  if (record.revealed && isSelected && !isAnswer) classes.push('is-wrong');
                  if (record.revealed && !isAnswer && !isSelected) classes.push('is-dim');
                  return (
                    <button
                      key={optionIndex}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={classes.join(' ')}
                      disabled={record.revealed}
                      onClick={() => choose(question.id, optionIndex)}
                    >
                      <span className="quiz__letter" aria-hidden="true">
                        {record.revealed && isAnswer ? (
                          <Icon name="check" size={14} />
                        ) : record.revealed && isSelected && !isAnswer ? (
                          <Icon name="close" size={13} />
                        ) : (
                          LETTERS[optionIndex] ?? optionIndex + 1
                        )}
                      </span>
                      <span className="quiz__option-text">
                        <InlineText text={option} />
                      </span>
                    </button>
                  );
                })}
              </div>

              {record.revealed ? (
                <div
                  className={isCorrect ? 'quiz__explain is-correct' : 'quiz__explain is-wrong'}
                  aria-live="polite"
                >
                  <div className="quiz__explain-head">
                    <Icon name={isCorrect ? 'circle-check' : 'info'} size={15} />
                    <span>{isCorrect ? '回答正确' : `正确答案是 ${LETTERS[question.answer] ?? question.answer + 1}`}</span>
                  </div>
                  <p className="quiz__explain-text">
                    <InlineText text={question.explanation} />
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <footer className="quiz__foot">
        {record.revealed ? (
          <>
            <p className="quiz__score" aria-live="polite">
              答对 <strong className="tabular">{score}</strong> / {questions.length} 题
              {score === questions.length ? '，全部正确。' : '，可以回看解析再试一次。'}
            </p>
            <Button variant="secondary" icon="reset" onClick={retry}>
              再试一次
            </Button>
          </>
        ) : (
          <>
            <p className="quiz__hint">
              {allAnswered
                ? '已答完所有题目，查看答案解析吧。'
                : `还有 ${questions.length - answeredCount} 题未作答，选择后可以修改。`}
            </p>
            <Button variant="primary" icon="check" onClick={reveal} disabled={!allAnswered}>
              查看答案
            </Button>
          </>
        )}
      </footer>
    </section>
  );
}
